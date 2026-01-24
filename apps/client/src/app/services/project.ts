import { Injectable, inject, signal, computed, Signal } from '@angular/core';
import { ApiService } from './api';
import { ContainerEngine } from './container-engine';
import { ToastService } from './toast';
import { Router } from '@angular/router';
import { BASE_FILES } from '../base-project';
import { RUNTIME_SCRIPTS } from '../runtime-scripts';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FileSystemStore } from './file-system.store';
import { WebContainerFiles, FigmaImportPayload } from '@adorable/shared-types';
import { ScreenshotService } from './screenshot';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  files?: any;
  usage?: { inputTokens: number, outputTokens: number, totalTokens: number };
  status?: string;
  model?: string;
  updatedFiles?: string[];
  toolResults?: { tool: string, result: string, isError?: boolean }[];
  isExpanded?: boolean; // For files
  areToolsExpanded?: boolean; // For tool results
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private apiService = inject(ApiService);
  private webContainerService = inject(ContainerEngine);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private screenshotService = inject(ScreenshotService);
  public fileStore = inject(FileSystemStore);

  // State
  projectId = signal<string | null>(null);
  projectName = signal<string>('');
  
  // Use store for files
  files: Signal<WebContainerFiles> = this.fileStore.files; 
  
  messages = signal<ChatMessage[]>([
    { role: 'assistant', text: 'Hi! I can help you build an Angular app. Describe what you want to create.', timestamp: new Date() }
  ]);
  loading = signal(false);
  buildError = signal<string | null>(null);
  debugLogs = signal<any[]>([]);
  figmaImports = signal<FigmaImportPayload[]>([]);

  // Computed
  hasProject = computed(() => !!this.projectId() && this.projectId() !== 'new');

  async loadProject(id: string) {
    this.loading.set(true);
    // Clear current preview state immediately
    await this.webContainerService.stopDevServer();
    
    this.apiService.loadProject(id).subscribe({
      next: async (project) => {
        this.projectId.set(project.id);
        this.projectName.set(project.name);

        if (project.messages) {
          this.messages.set(project.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          })));
        } else {
          this.messages.set([]);
        }

        // Load Figma imports
        if (project.figmaImports) {
          this.figmaImports.set(project.figmaImports);
        } else {
          this.figmaImports.set([]);
        }

        await this.reloadPreview(project.files);
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to load project', 'error');
        this.router.navigate(['/dashboard']);
        this.loading.set(false);
      }
    });
  }

  async saveProject(thumbnail?: string) {
    const name = this.projectName();
    const files = this.files();
    if (!name || this.fileStore.isEmpty()) return;

    this.loading.set(true);
    
    // Capture thumbnail if not provided
    if (!thumbnail) {
       console.log('[ProjectService] capturing thumbnail...');
       const captured = await this.screenshotService.captureThumbnail();
       if (captured) thumbnail = captured;
    }

    const id = this.projectId();
    const saveId = (id && id !== 'new') ? id : undefined;

    this.apiService.saveProject(name, files, this.messages(), saveId, thumbnail, this.figmaImports()).subscribe({
      next: (project) => {
        this.toastService.show('Project saved successfully!', 'success');
        this.projectId.set(project.id);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to save project', 'error');
        this.loading.set(false);
      }
    });
  }

  async publish() {
    const id = this.projectId();
    if (!id || id === 'new') {
      this.toastService.show('Please save the project first', 'info');
      return;
    }

    this.loading.set(true);
    this.addSystemMessage('Building and publishing your app...');

    try {
      const exitCode = await this.webContainerService.runBuild(['--base-href', './']);
      if (exitCode !== 0) throw new Error('Build failed');

      let distPath = 'dist';
      try {
         const foundPath = await this.findWebRoot('dist');
         if (foundPath) distPath = foundPath;
         else distPath = 'dist/app/browser';
      } catch (e) { 
         distPath = 'dist/app/browser';
      }
      
      const files = await this.getFilesRecursively(distPath);

      this.apiService.publish(id, files).subscribe({
        next: (res) => {
          this.addAssistantMessage(`Success! Your app is published at: ${res.url}`);
          window.open(res.url, '_blank');
          this.toastService.show('Site published successfully!', 'success');
          this.loading.set(false);
        },
        error: (err) => {
          throw err;
        }
      });

    } catch (err: any) {
      console.error(err);
      this.addSystemMessage(`Publishing error: ${err.message}`);
      this.toastService.show('Publishing failed', 'error');
      this.loading.set(false);
    }
  }

  async downloadZip() {
    const files = this.files();
    if (this.fileStore.isEmpty()) return;
    
    this.loading.set(true);
    try {
      const zip = new JSZip();
      // Files are already merged/current in the store
      const fullProject = files; 
      
      const addFilesToZip = (fs: WebContainerFiles, currentPath: string) => {
        for (const key in fs) {
          const node = fs[key];
          if (node.file) {
             zip.file(`${currentPath}${key}`, node.file.contents);
          } else if (node.directory) {
             addFilesToZip(node.directory, `${currentPath}${key}/`);
          }
        }
      };

      addFilesToZip(fullProject, '');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${this.projectName() || 'adorable-app'}.zip`);
      this.toastService.show('Project exported', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      this.toastService.show('Failed to export project', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async reloadPreview(files: any) {
    this.loading.set(true);
    try {
      await this.webContainerService.stopDevServer();
      await this.webContainerService.clean();

      const mergedFiles = this.mergeFiles(BASE_FILES, files || {});
      this.fileStore.setFiles(mergedFiles);
      
      const { tree, binaries } = this.prepareFilesForMount(mergedFiles);

      await this.webContainerService.mount(tree);
      
      for (const bin of binaries) {
        await this.webContainerService.writeFile(bin.path, bin.content);
      }
      
      const exitCode = await this.webContainerService.runInstall();
      
      if (exitCode === 0) {
        this.webContainerService.startDevServer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  async migrateProject() {
    const files = this.files();
    if (this.fileStore.isEmpty()) return;
    
    this.loading.set(true);
    try {
      // Direct updates via store
      if (!files['public']) {
        this.fileStore.updateFile('public/.gitkeep', '');
      }

      if (files['angular.json'] && files['angular.json'].file) {
        const content = files['angular.json'].file.contents;
        const config = JSON.parse(content);
        
        const appArchitect = config.projects.app.architect;
        const buildOptions = appArchitect.build.options;
        
        const hasPublic = buildOptions.assets.some((a: any) => typeof a === 'object' && a.input === 'public');
        if (!hasPublic) {
           buildOptions.assets.push({ "glob": "**/*", "input": "public" });
        }

        // Enable HMR (requires optimization: false in build options)
        const buildOptions = appArchitect.build.options;
        buildOptions.optimization = false;

        const serveOptions = appArchitect.serve.options;
        serveOptions.hmr = true;
        serveOptions.allowedHosts = ["all"];

        const newConfig = JSON.stringify(config, null, 2);
        this.fileStore.updateFile('angular.json', newConfig);
      }

      // Reload with new state
      await this.reloadPreview(this.files()); 
      this.toastService.show('Project configuration updated', 'success');
    } catch (err) {
      console.error(err);
      this.toastService.show('Migration failed', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  // Helpers
  addSystemMessage(text: string) {
    this.messages.update(msgs => [...msgs, {
      role: 'system',
      text,
      timestamp: new Date()
    }]);
  }

  addAssistantMessage(text: string) {
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      text,
      timestamp: new Date()
    }]);
  }

  // NOTE: This is likely no longer needed if we use Store, 
  // but keeping it for now if external utilities use it or just removing it.
  // The Store handles updates.
  // updateFileInTree -> fileStore.updateFile

  mergeFiles(base: any, generated: any): any {
    const result = { ...base };
    for (const key in generated) {
      if (generated[key].directory && result[key]?.directory) {
        result[key] = {
          directory: this.mergeFiles(result[key].directory, generated[key].directory)
        };
      } else {
        result[key] = generated[key];
      }
    }
    return result;
  }

  private prepareFilesForMount(files: any, prefix = ''): { tree: any, binaries: { path: string, content: Uint8Array }[] } {
    const tree: any = {};
    let binaries: { path: string, content: Uint8Array }[] = [];

    for (const key in files) {
      const fullPath = prefix + key;
      if (files[key].file) {
        let content = files[key].file.contents;
        const isDataUri = typeof content === 'string' && content.trim().startsWith('data:');
        
        if (isDataUri) {
           const binary = this.dataURIToUint8Array(content);
           binaries.push({ path: fullPath, content: binary });
        } else {
           if (key === 'index.html' && typeof content === 'string') {
              // Determine correct base href based on engine
              const engine: any = this.webContainerService;
              const isLocal = engine.mode && engine.mode() === 'local';
              const baseHref = isLocal ? '/api/proxy/' : '/';

              if (content.includes('<base href=')) {
                 content = content.replace(/<base href="[^"]*"/, `<base href="${baseHref}"`);
              } else {
                 content = content.replace('<head>', `<head>\n  <base href="${baseHref}" />`);
              }

              // Ensure we have the latest runtime scripts
              const scriptTag = '<!-- ADORABLE_RUNTIME_SCRIPTS -->';
              if (content.includes(scriptTag)) {
                 const pattern = new RegExp(`${scriptTag}[\s\S]*${scriptTag}`);
                 content = content.replace(pattern, `${scriptTag}\n${RUNTIME_SCRIPTS}\n${scriptTag}`);
              } else {
                 content = content.replace('</head>', `${scriptTag}\n${RUNTIME_SCRIPTS}\n${scriptTag}\n</head>`);
              }
           }
           tree[key] = { file: { contents: content } };
        }
      } else if (files[key].directory) {
        const result = this.prepareFilesForMount(files[key].directory, fullPath + '/');
        tree[key] = { directory: result.tree };
        binaries = binaries.concat(result.binaries);
      }
    }
    return { tree, binaries };
  }

  dataURIToUint8Array(dataURI: string): Uint8Array {
    const byteString = atob(dataURI.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return ia;
  }

  private async findWebRoot(currentPath: string): Promise<string | null> {
    try {
      const entries = await this.webContainerService.readdir(currentPath, { withFileTypes: true }) as any[];
      if (entries.some(e => e.name === 'index.html')) return currentPath;
      
      const dirs = entries.filter(e => e.isDirectory());
      for (const dir of dirs) {
         const result = await this.findWebRoot(`${currentPath}/${dir.name}`);
         if (result) return result;
      }
    } catch (e) { } // Ignore errors, likely directory not found
    return null;
  }

  private async getFilesRecursively(dirPath: string): Promise<any> {
    const result = await this.webContainerService.readdir(dirPath, { withFileTypes: true });
    const entries = result as unknown as { name: string; isDirectory: () => boolean }[];
    const files: any = {};

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory()) {
        files[entry.name] = {
          directory: await this.getFilesRecursively(fullPath)
        };
      } else {
        const isBinary = /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|eot|ttf|woff|woff2)$/i.test(entry.name);
        if (isBinary) {
          const binary = await this.webContainerService.readBinaryFile(fullPath);
          files[entry.name] = {
            file: { 
              contents: this.uint8ArrayToBase64(binary),
              encoding: 'base64'
            }
          };
        } else {
          const contents = await this.webContainerService.readFile(fullPath);
          files[entry.name] = {
            file: { contents }
          };
        }
      }
    }
    return files;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
