import { Injectable, inject, signal, computed, Signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ApiService } from './api';
import { ContainerEngine } from './container-engine';
import { ToastService } from './toast';
import { Router } from '@angular/router';
import { BASE_FILES, DEFAULT_KIT } from '../base-project';
import { RUNTIME_SCRIPTS } from '../runtime-scripts';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FileSystemStore } from './file-system.store';
import {
  FileTree,
  FigmaImportPayload,
  mergeFiles as sharedMergeFiles,
} from '@adorable/shared-types';
import { ScreenshotService } from './screenshot';
import { Kit, FileTree as KitFileTree } from './kit-types';
import { HMRTriggerService } from './hmr-trigger.service';
import { getServerUrl } from './server-url';

export interface QuestionOption {
  value: string;
  label: string;
  recommended?: boolean;
  preview?: string; // For image type: URL or path to preview
}

export interface Question {
  id: string;
  text: string;
  type: 'radio' | 'checkbox' | 'text' | 'color' | 'range' | 'image' | 'code';
  options?: QuestionOption[];
  placeholder?: string;
  required?: boolean;
  default?: string | string[] | number; // For radio/text/color/code: string, checkbox: string[], range: number
  // Range type properties
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // Code type properties
  language?: string;
  // Image type properties
  allowUpload?: boolean;
}

export interface PendingQuestion {
  requestId: string;
  questions: Question[];
  context?: string;
  answers: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  files?: any;
  commitSha?: string; // Git commit SHA for version restore
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    cost?: {
      inputCost: number;
      outputCost: number;
      cacheCreationCost: number;
      cacheReadCost: number;
      totalCost: number;
    };
  };
  status?: string;
  model?: string;
  updatedFiles?: string[];
  toolResults?: { tool: string; result: string; isError?: boolean }[];
  duration?: number; // milliseconds
  isExpanded?: boolean; // For files
  areToolsExpanded?: boolean; // For tool results
  pendingQuestion?: PendingQuestion; // For ask_user tool
}

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private apiService = inject(ApiService);
  private containerEngine = inject(ContainerEngine);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private screenshotService = inject(ScreenshotService);
  private hmrTrigger = inject(HMRTriggerService);
  public fileStore = inject(FileSystemStore);

  // Guard against concurrent loadProject/reloadPreview calls (fast project switching)
  private _loadEpoch = 0;

  // Emitted when switching projects so active generation streams can be cancelled
  readonly projectSwitching$ = new Subject<void>();

  // State
  projectId = signal<string | null>(null);
  projectName = signal<string>('');
  /** Whether this project has been persisted to the database at least once. */
  isSaved = signal(false);
  selectedKitId = signal<string | null>(null);
  currentKitTemplate = signal<KitFileTree | null>(null);

  // Use store for files
  files: Signal<FileTree> = this.fileStore.files;

  messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hi! I can help you build an Angular app. Describe what you want to create.',
      timestamp: new Date(),
    },
  ]);
  loading = signal(false);
  buildError = signal<string | null>(null);
  debugLogs = signal<any[]>([]);
  figmaImports = signal<FigmaImportPayload[]>([]);

  // Bumped after each successful save (so version history can auto-refresh)
  saveVersion = signal(0);

  // Computed
  hasProject = computed(() => !!this.projectId() && this.isSaved());

  async loadProject(id: string) {
    // Bump epoch so any in-flight loadProject/reloadPreview from a previous call bails out
    const epoch = ++this._loadEpoch;
    console.log('load project 1');

    // Cancel any active AI generation before switching projects
    // This prevents SSE events from the old project bleeding into the new one
    const sameProject =
      this.projectId() === id && this.containerEngine.url();
    console.log('load project 2');

    if (!sameProject) {
      this.projectSwitching$.next();
      // Pause HMR to prevent buffered file updates from bleeding across projects
      this.hmrTrigger.pause();
    }
    console.log('load project 3');

    this.loading.set(true);
    const stopPromise = sameProject
      ? Promise.resolve()
      : Promise.race([
          this.containerEngine.stopDevServer(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);

    console.log('load project 4');

    try {
      // Start API fetch (and server stop if needed) IN PARALLEL
      const [_, project] = await Promise.all([
        stopPromise,
        this.apiService.loadProject(id).toPromise(),
      ]);
      console.log('load project 5');

      // Another loadProject was called while we were waiting — abort
      if (this._loadEpoch !== epoch) return;

      if (!project) {
        this.toastService.show('Failed to load project', 'error');
        this.router.navigate(['/dashboard']);
        this.loading.set(false);
        return;
      }

      this.projectId.set(project.id);
      this.projectName.set(project.name);
      this.isSaved.set(true);
      this.selectedKitId.set(project.selectedKitId || null);

      if (project.messages) {
        this.messages.set(
          project.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        );
      } else {
        this.messages.set([]);
      }

      // Load Figma imports
      if (project.figmaImports) {
        this.figmaImports.set(project.figmaImports);
      } else {
        this.figmaImports.set([]);
      }

      // skipStop=true if we already stopped above; false if same project (let reloadPreview fast-path handle it)
      await this.reloadPreview(project.files, undefined, !sameProject, epoch);
      // Resume HMR after new project files are loaded
      this.hmrTrigger.resume();
    } catch (err) {
      if (this._loadEpoch !== epoch) return; // stale, don't show error
      console.error(err);
      this.toastService.show('Failed to load project', 'error');
      this.router.navigate(['/dashboard']);
      this.loading.set(false);
      this.hmrTrigger.resume();
    }
  }

  async saveProject(thumbnail?: string, options?: { silent?: boolean }) {
    const name = this.projectName();
    if (!name || this.fileStore.isEmpty()) return;

    const silent = options?.silent ?? false;

    if (!silent) this.loading.set(true);

    const id = this.projectId();
    const saveId = id || undefined;

    // Start thumbnail capture in parallel — don't block the save
    // Skip thumbnail capture in silent mode (e.g. auto-save during project switch)
    let thumbnailPromise: Promise<string | null> | undefined;
    if (!thumbnail && !silent) {
      console.log('[ProjectService] capturing thumbnail (non-blocking)...');
      thumbnailPromise = this.screenshotService.captureThumbnail();
    }

    const doSave = (thumb?: string) => {
      // Capture files at save-execution time (not earlier) to avoid stale snapshots
      const currentFiles = this.files();
      // Strip file snapshots from messages — git commits handle time-travel now.
      const messagesWithoutFiles = this.messages().map(
        ({ files: _files, ...rest }) => rest,
      );

      this.apiService
        .saveProject(
          name,
          currentFiles,
          messagesWithoutFiles,
          saveId,
          thumb,
          this.figmaImports(),
          this.selectedKitId(),
        )
        .subscribe({
          next: (project) => {
            // Guard: only update projectId if we're still on the same project
            // A project switch may have happened while the save was in flight
            if (
              this.projectId() === id ||
              !this.projectId()
            ) {
              this.projectId.set(project.id);
            }
            this.isSaved.set(true);
            if (!silent)
              this.toastService.show('Project saved successfully!', 'success');
            if (!silent) this.loading.set(false);
            this.saveVersion.update((v) => v + 1);
          },
          error: (err) => {
            console.error(err);
            if (!silent)
              this.toastService.show('Failed to save project', 'error');
            if (!silent) this.loading.set(false);
          },
        });
    };

    if (thumbnail) {
      doSave(thumbnail);
    } else if (thumbnailPromise) {
      // Race: if thumbnail resolves quickly, include it; otherwise save without it
      const quickThumb = await Promise.race([
        thumbnailPromise,
        new Promise<null>((r) => setTimeout(() => r(null), 1500)),
      ]);
      doSave(quickThumb ?? undefined);

      // If thumbnail wasn't ready yet, update it via a follow-up save
      if (!quickThumb && saveId) {
        thumbnailPromise.then((captured) => {
          // Only update if we're still on the same project
          if (captured && this.projectId() === id) {
            console.log('[ProjectService] Updating thumbnail after save');
            const latestFiles = this.files();
            const latestMsgs = this.messages().map(
              ({ files: _f, ...rest }) => rest,
            );
            this.apiService
              .saveProject(
                name,
                latestFiles,
                latestMsgs,
                saveId,
                captured,
                this.figmaImports(),
                this.selectedKitId(),
              )
              .subscribe();
          }
        });
      }
    } else {
      doSave();
    }
  }

  async publish() {
    const id = this.projectId();
    if (!id || !this.isSaved()) {
      this.toastService.show('Please save the project first', 'info');
      return;
    }

    this.loading.set(true);
    this.addSystemMessage('Building and publishing your app...');

    try {
      const exitCode = await this.containerEngine.runBuild([
        '--base-href',
        './',
      ]);
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
          this.addAssistantMessage(
            `Success! Your app is published at: ${res.url}`,
          );
          window.open(res.url, '_blank');
          this.toastService.show('Site published successfully!', 'success');
          this.loading.set(false);
        },
        error: (err) => {
          throw err;
        },
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

      const addFilesToZip = (fs: FileTree, currentPath: string) => {
        for (const key in fs) {
          const node = fs[key];
          if (node.file) {
            const contents = node.file.contents;
            if (
              typeof contents === 'string' &&
              contents.trim().startsWith('data:')
            ) {
              // Data URI → decode to binary for correct zip entry
              const binary = this.dataURIToUint8Array(contents);
              zip.file(`${currentPath}${key}`, binary);
            } else if (node.file.encoding === 'base64') {
              // Raw base64 → decode to binary
              const byteStr = atob(contents);
              const ab = new ArrayBuffer(byteStr.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
              zip.file(`${currentPath}${key}`, ia);
            } else {
              zip.file(`${currentPath}${key}`, contents);
            }
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

  async reloadPreview(
    files: any,
    kitTemplate?: KitFileTree,
    skipStop = false,
    epoch?: number,
  ) {
    // If no epoch provided (direct call, e.g. from version restore), create our own
    if (epoch === undefined) {
      epoch = ++this._loadEpoch;
    }
    const isStale = () => this._loadEpoch !== epoch;

    this.loading.set(true);

    // Ensure container engine knows which project we're working with
    this.containerEngine.currentProjectId = this.projectId() || null;

    // Yield to allow loading state to render
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (isStale()) return;

    // Fast reconnect: if container already has our project with dev server running, skip everything
    if (!kitTemplate && this.projectId() && this.containerEngine.checkStatus) {
      try {
        const status = await this.containerEngine.checkStatus();
        if (status.running && status.projectId === this.projectId() && status.devServerReady) {
          // Container already has the right project with dev server running — just reconnect
          const userId = JSON.parse(localStorage.getItem('adorable_user') || '{}').id;
          const serverBase = getServerUrl();
          (this.containerEngine.url as any).set(`${serverBase}/api/proxy/?user=${userId}`);
          (this.containerEngine.status as any).set('Ready');
          this.containerEngine.lastBootedProjectId = this.projectId();
          this.loading.set(false);
          return;
        }
      } catch { /* status check failed, continue with normal flow */ }
    }

    // Fast path: skip stop/clean/install/start when deps haven't changed
    // and the dev server is already running (e.g. version restore with same package.json)
    if (!kitTemplate && this.containerEngine.url()) {
      const currentPkg = this.fileStore.getFileContent('package.json');
      const incomingPkg = files?.['package.json']?.file?.contents ?? null;
      // If incoming files don't include package.json, or it matches the current one, fast path
      const depsUnchanged = incomingPkg === null || incomingPkg === currentPkg;

      if (depsUnchanged) {
        try {
          const baseFiles = this.currentKitTemplate() || BASE_FILES;
          const mergedFiles = this.mergeFiles(baseFiles, files || {});
          if (isStale()) return;

          this.fileStore.setFiles(mergedFiles);

          await new Promise((resolve) => setTimeout(resolve, 0));
          if (isStale()) return;

          const tree = this.prepareFilesForMount(mergedFiles);
          await this.containerEngine.mount(tree);
          if (isStale()) return;

          return; // Angular HMR picks up the file changes
        } catch (err) {
          if (isStale()) return;
          console.error(
            'Fast-path reload failed, falling back to full reload',
            err,
          );
          // Fall through to full reload below
        } finally {
          this.loading.set(false);
        }
      }
    }

    try {
      if (!skipStop) {
        // Stop with timeout to prevent hanging
        await Promise.race([
          this.containerEngine.stopDevServer(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }
      if (isStale()) return;

      // Full clean when switching kit templates to clear stale node_modules/lockfiles
      await this.containerEngine.clean(!!kitTemplate);
      if (isStale()) return;

      // Yield before heavy sync operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Use kit template if provided, otherwise use current kit template or default BASE_FILES
      const baseFiles = kitTemplate || this.currentKitTemplate() || BASE_FILES;
      if (kitTemplate) {
        this.currentKitTemplate.set(kitTemplate);
      }

      const mergedFiles = this.mergeFiles(baseFiles, files || {});

      // Yield before updating store (triggers change detection)
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (isStale()) return;

      this.fileStore.setFiles(mergedFiles);

      // Use server-side mount when project has been saved (has a projectId on disk)
      const pid = this.projectId();
      if (pid && this.isSaved() && this.containerEngine.mountProject) {
        await this.containerEngine.mountProject(
          pid,
          this.selectedKitId() || null,
        );
      } else {
        // Fallback for new unsaved projects: send files over HTTP
        await new Promise((resolve) => setTimeout(resolve, 0));

        const tree = this.prepareFilesForMount(mergedFiles);

        await this.containerEngine.mount(tree);
        if (isStale()) return;
      }
      if (isStale()) return;

      const exitCode = await this.containerEngine.runInstall();
      if (isStale()) return;

      if (exitCode === 0) {
        this.containerEngine.startDevServer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load kit template files for a given kit
   */
  async loadKitTemplate(kitId: string): Promise<KitFileTree | null> {
    if (kitId === DEFAULT_KIT.id) {
      return DEFAULT_KIT.template.files;
    }

    try {
      const result = await this.apiService.getKit(kitId).toPromise();
      if (result?.kit?.template?.files) {
        return result.kit.template.files;
      }
    } catch (err) {
      console.error('Failed to load kit template:', err);
    }
    return null;
  }

  /**
   * Set the kit for the current project and optionally reload preview
   */
  async setKit(kitId: string, reloadPreviewNow = true) {
    this.selectedKitId.set(kitId);
    const template = await this.loadKitTemplate(kitId);
    if (template) {
      this.currentKitTemplate.set(template);
      if (reloadPreviewNow) {
        await this.reloadPreview(this.files(), template);
      }
    }
  }

  // Helpers
  addSystemMessage(text: string) {
    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'system',
        text,
        timestamp: new Date(),
      },
    ]);
  }

  addAssistantMessage(text: string) {
    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'assistant',
        text,
        timestamp: new Date(),
      },
    ]);
  }

  // NOTE: This is likely no longer needed if we use Store,
  // but keeping it for now if external utilities use it or just removing it.
  // The Store handles updates.
  // updateFileInTree -> fileStore.updateFile

  mergeFiles(base: any, generated: any): any {
    return sharedMergeFiles(base, generated);
  }

  private static SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    '.angular',
    '.cache',
    '.git',
    '.adorable',
  ]);

  private prepareFilesForMount(files: any): any {
    const tree: any = {};

    for (const key in files) {
      // Skip build artifacts and large directories that shouldn't be mounted
      if (files[key].directory && ProjectService.SKIP_DIRS.has(key)) continue;

      if (files[key].file) {
        let content = files[key].file.contents;
        const isDataUri =
          typeof content === 'string' && content.trim().startsWith('data:');

        if (isDataUri) {
          // Convert data URI to base64 inline — mount() handles encoding: 'base64'
          const base64 = content.split(',')[1] || '';
          tree[key] = { file: { contents: base64, encoding: 'base64' } };
        } else {
          if (key === 'index.html' && typeof content === 'string') {
            // Determine correct base href based on engine
            const engine: any = this.containerEngine;
            const isLocal = engine.mode && engine.mode() === 'local';
            const baseHref = isLocal ? '/api/proxy/' : '/';

            if (content.includes('<base href=')) {
              content = content.replace(
                /<base href="[^"]*"/,
                `<base href="${baseHref}"`,
              );
            } else {
              content = content.replace(
                '<head>',
                `<head>\n  <base href="${baseHref}" />`,
              );
            }

            // Ensure we have the latest runtime scripts
            const scriptTag = '<!-- ADORABLE_RUNTIME_SCRIPTS -->';
            if (content.includes(scriptTag)) {
              const pattern = new RegExp(`${scriptTag}[\s\S]*${scriptTag}`);
              content = content.replace(
                pattern,
                `${scriptTag}\n${RUNTIME_SCRIPTS}\n${scriptTag}`,
              );
            } else {
              content = content.replace(
                '</head>',
                `${scriptTag}\n${RUNTIME_SCRIPTS}\n${scriptTag}\n</head>`,
              );
            }
          }
          tree[key] = { file: { contents: content } };
        }
      } else if (files[key].directory) {
        tree[key] = { directory: this.prepareFilesForMount(files[key].directory) };
      }
    }
    return tree;
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
      const entries = (await this.containerEngine.readdir(currentPath, {
        withFileTypes: true,
      })) as any[];
      if (entries.some((e) => e.name === 'index.html')) return currentPath;

      const dirs = entries.filter((e) => e.isDirectory());
      for (const dir of dirs) {
        const result = await this.findWebRoot(`${currentPath}/${dir.name}`);
        if (result) return result;
      }
    } catch (e) {} // Ignore errors, likely directory not found
    return null;
  }

  private async getFilesRecursively(dirPath: string): Promise<any> {
    const result = await this.containerEngine.readdir(dirPath, {
      withFileTypes: true,
    });
    const entries = result as unknown as {
      name: string;
      isDirectory: () => boolean;
    }[];
    const files: any = {};

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory()) {
        files[entry.name] = {
          directory: await this.getFilesRecursively(fullPath),
        };
      } else {
        const isBinary =
          /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|eot|ttf|woff|woff2)$/i.test(
            entry.name,
          );
        if (isBinary) {
          const binary =
            await this.containerEngine.readBinaryFile(fullPath);
          files[entry.name] = {
            file: {
              contents: this.uint8ArrayToBase64(binary),
              encoding: 'base64',
            },
          };
        } else {
          const contents = await this.containerEngine.readFile(fullPath);
          files[entry.name] = {
            file: { contents },
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
