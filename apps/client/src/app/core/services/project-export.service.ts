import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FileTree, PublishVisibility } from '@adorable/shared-types';
import { ApiService } from './api';
import { ContainerEngine } from './container-engine';
import { ToastService } from './toast';
import { ChatHistoryStore } from './chat-history.store';
import { KitManagementStore } from './kit-management.store';
import { dataURIToUint8Array, uint8ArrayToBase64 } from './binary-file.utils';
import { getServerUrl } from './server-url';

/**
 * Build, publish, and download flows for a project.
 *
 * Extracted from ProjectService so the export concerns (zip a tree, run a
 * production build, ship the dist directory to the API, walk the container
 * filesystem to find the web root) live in one place. ProjectService keeps
 * thin wrapper methods for back-compat with existing callers.
 */
@Injectable({ providedIn: 'root' })
export class ProjectExportService {
  private apiService = inject(ApiService);
  private containerEngine = inject(ContainerEngine);
  private toastService = inject(ToastService);
  private chatHistory = inject(ChatHistoryStore);
  private kits = inject(KitManagementStore);

  /**
   * Build the project, walk the produced dist directory, and ship the files
   * to the publish endpoint. Streams progress to the chat thread and toasts
   * the final result. Caller is responsible for guarding `isSaved` and for
   * setting/clearing the global loading flag.
   */
  async publish(projectId: string, visibility?: PublishVisibility): Promise<void> {
    this.chatHistory.addSystemMessage('Building and publishing your app...');

    try {
      const exitCode = await this.containerEngine.runBuild(
        ['--base-href', './'],
        this.kits.currentKit()?.commands?.build,
      );
      if (exitCode !== 0) throw new Error('Build failed');

      let distPath = 'dist';
      try {
        const foundPath = await this.findWebRoot('dist');
        distPath = foundPath ?? 'dist/app/browser';
      } catch {
        distPath = 'dist/app/browser';
      }

      const files = await this.getFilesRecursively(distPath);

      await new Promise<void>((resolve, reject) => {
        this.apiService.publish(projectId, files, visibility).subscribe({
          next: async (res) => {
            this.chatHistory.addAssistantMessage(`Success! Your app is published at: ${res.url}`);

            // For private sites, exchange JWT for the visitor cookie so the
            // newly opened tab is authenticated.
            if (res.visibility === 'private') {
              try {
                const token = localStorage.getItem('adorable_token');
                await fetch(`${getServerUrl()}/api/sites/auth/token-exchange`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                  credentials: 'include',
                });
              } catch (e) {
                console.warn('[Publish] Token exchange failed:', e);
              }
            }

            const electronAPI = (window as any).electronAPI;
            if (electronAPI?.openExternal) {
              electronAPI.openExternal(res.url);
            } else {
              window.open(res.url, '_blank');
            }

            this.toastService.show('Site published successfully!', 'success');
            resolve();
          },
          error: reject,
        });
      });
    } catch (err: any) {
      console.error(err);
      this.chatHistory.addSystemMessage(`Publishing error: ${err.message}`);
      this.toastService.show('Publishing failed', 'error');
    }
  }

  /**
   * Bundle the project's in-memory file tree into a zip and trigger a
   * browser download.
   */
  async downloadZip(projectName: string, files: FileTree): Promise<void> {
    try {
      const zip = new JSZip();
      addFilesToZip(zip, files, '');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${projectName || 'adorable-app'}.zip`);
      this.toastService.show('Project exported', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      this.toastService.show('Failed to export project', 'error');
    }
  }

  // ─── Container filesystem walkers ──────────────────────────────────

  /**
   * Search a container path for the directory containing `index.html` —
   * different Angular build targets place the bundled site at different
   * depths (`dist/`, `dist/app/`, `dist/app/browser/`).
   */
  private async findWebRoot(currentPath: string): Promise<string | null> {
    try {
      const entries = (await this.containerEngine.readdir(currentPath, { withFileTypes: true })) as any[];
      if (entries.some((e) => e.name === 'index.html')) return currentPath;

      const dirs = entries.filter((e) => e.isDirectory());
      for (const dir of dirs) {
        const result = await this.findWebRoot(`${currentPath}/${dir.name}`);
        if (result) return result;
      }
    } catch {
      // Directory missing — fall through.
    }
    return null;
  }

  /**
   * Recursively read a container directory into the FileTree shape used
   * by the publish API. Binary file types are read as bytes and base64-
   * encoded; everything else is read as text.
   */
  private async getFilesRecursively(dirPath: string): Promise<any> {
    const result = await this.containerEngine.readdir(dirPath, { withFileTypes: true });
    const entries = result as unknown as { name: string; isDirectory: () => boolean }[];
    const files: any = {};

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory()) {
        files[entry.name] = { directory: await this.getFilesRecursively(fullPath) };
      } else if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|eot|ttf|woff|woff2)$/i.test(entry.name)) {
        const binary = await this.containerEngine.readBinaryFile(fullPath);
        files[entry.name] = { file: { contents: uint8ArrayToBase64(binary), encoding: 'base64' } };
      } else {
        const contents = await this.containerEngine.readFile(fullPath);
        files[entry.name] = { file: { contents } };
      }
    }
    return files;
  }
}

/** Recursive helper for downloadZip. Top-level so it doesn't capture `this`. */
function addFilesToZip(zip: JSZip, fs: FileTree, currentPath: string): void {
  for (const key in fs) {
    const node = fs[key];
    if (node.file) {
      const contents = node.file.contents;
      if (typeof contents === 'string' && contents.trim().startsWith('data:')) {
        zip.file(`${currentPath}${key}`, dataURIToUint8Array(contents));
      } else if (node.file.encoding === 'base64') {
        const byteStr = atob(contents);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        zip.file(`${currentPath}${key}`, bytes);
      } else {
        zip.file(`${currentPath}${key}`, contents);
      }
    } else if (node.directory) {
      addFilesToZip(zip, node.directory, `${currentPath}${key}/`);
    }
  }
}
