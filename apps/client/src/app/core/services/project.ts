import { Injectable, inject, signal, computed, Signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ApiService } from './api';
import { ContainerEngine } from './container-engine';
import { ToastService } from './toast';
import { Router } from '@angular/router';
import { RUNTIME_SCRIPTS } from '../models/runtime-scripts';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FileSystemStore } from './file-system.store';
import {
  FileTree,
  FigmaImportPayload,
  PublishVisibility,
  mergeFiles as sharedMergeFiles,
} from '@adorable/shared-types';
import { ScreenshotService } from './screenshot';
import { Kit, FileTree as KitFileTree, KitCommands } from './kit-types';
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
      subscription?: boolean;
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
  /** Absolute path to an external project directory (desktop "Open Folder" feature). */
  externalPath = signal<string | null>(null);
  /** Auto-detected config for external projects (commands, preset, etc.). */
  detectedConfig = signal<any>(null);
  /** User-provided Tailwind prefix override (from project settings). */
  tailwindPrefixOverride = signal<string>('');
  /** Active locale selected in the Translations panel — used by visual editor to target the right file. */
  activeTranslationLocale = signal<string>('');
  currentKit = signal<Kit | null>(null);
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
  cloudEditorBlocked = signal<'capacity' | 'access_denied' | null>(null);
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
    const _tLoad = Date.now();

    // Cancel any active AI generation before switching projects
    // This prevents SSE events from the old project bleeding into the new one
    const sameProject =
      this.projectId() === id && this.containerEngine.url();

    if (!sameProject) {
      this.projectSwitching$.next();
      // Pause HMR to prevent buffered file updates from bleeding across projects
      this.hmrTrigger.pause();
    }

    this.loading.set(true);
    const stopPromise = sameProject
      ? Promise.resolve()
      : Promise.race([
          this.containerEngine.stopDevServer(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);

    try {
      // Start API fetch (and server stop if needed) IN PARALLEL
      const [_, project] = await Promise.all([
        stopPromise,
        this.apiService.loadProject(id).toPromise(),
      ]);

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
      this.externalPath.set(project.externalPath || null);
      this.detectedConfig.set(project.detectedConfig || null);

      // Load the kit data (commands, systemPrompt, etc.) so the dev server
      // and build tools use the correct commands (e.g. ong instead of ng).
      if (project.selectedKitId) {
        await this.loadKitTemplate(project.selectedKitId);
      }

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
      console.log(`[loadProject] DONE — total time: ${Date.now() - _tLoad}ms`);
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
      // For external projects, don't send files — they live on disk already
      const currentFiles = this.externalPath() ? undefined : this.files();
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
            const isFirstSave = !id;
            if (
              this.projectId() === id ||
              !this.projectId()
            ) {
              this.projectId.set(project.id);
            }
            this.isSaved.set(true);
            this.selectedKitId.set(project.selectedKitId || null);
            if (!silent)
              this.toastService.show('Project saved successfully!', 'success');
            if (!silent) this.loading.set(false);
            this.saveVersion.update((v) => v + 1);

            // On first save, update the container engine's project ID so
            // subsequent reloadPreview calls use the real (persisted) project ID
            // instead of the temporary one. Do NOT call mountProject here —
            // that would reboot the dev server mid-generation, switching the
            // working directory and breaking build checks. The remount happens
            // naturally on the next reloadPreview (e.g. after generation completes
            // or the user reopens the project).
            if (isFirstSave) {
              this.containerEngine.currentProjectId = project.id;
            }
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
            const latestFiles = this.externalPath() ? undefined : this.files();
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

  async publish(visibility?: PublishVisibility) {
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
      ], this.currentKit()?.commands?.build);
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

      this.apiService.publish(id, files, visibility).subscribe({
        next: async (res) => {
          this.addAssistantMessage(
            `Success! Your app is published at: ${res.url}`,
          );

          // For private sites, exchange token so the cookie is set before opening
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

          // Open the published URL
          const electronAPI = (window as any).electronAPI;
          if (electronAPI?.openExternal) {
            electronAPI.openExternal(res.url);
          } else {
            window.open(res.url, '_blank');
          }

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

    // Ensure container engine knows which project we're working with.
    // For new unsaved projects (no ID yet), generate a temporary unique ID so the
    // native agent creates a fresh directory instead of reusing the shared 'desktop'
    // fallback — which causes cross-project contamination.
    if (!this.projectId()) {
      const tempId = 'new-' + crypto.randomUUID();
      this.containerEngine.currentProjectId = tempId;
    } else {
      this.containerEngine.currentProjectId = this.projectId();
    }

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
          const baseFiles = this.currentKitTemplate() || {};
          const mergedFiles = this.mergeFiles(baseFiles, files || {});
          if (isStale()) return;

          this.fileStore.setFiles(mergedFiles);

          await new Promise((resolve) => setTimeout(resolve, 0));
          if (isStale()) return;

          // External projects: files already live on disk, skip mount to avoid
          // overwriting real files with lazy-loaded empty stubs
          if (!this.externalPath()) {
            const tree = this.prepareFilesForMount(mergedFiles);
            await this.containerEngine.mount(tree);
            if (isStale()) return;
          }

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

      const extPath = this.externalPath();

      // External project: skip mount/clean — files already live on disk
      if (extPath) {
        // Set files in the store for the editor UI
        if (files && Object.keys(files).length > 0) {
          this.fileStore.setFiles(files);
        }
        if (isStale()) return;

        // Boot NativeManager pointing at the external path
        await this.containerEngine.boot(false, extPath);
        if (isStale()) return;

        // Enable injecting proxy so runtime scripts (inspector, console relay)
        // are injected into HTML responses without modifying project files
        const nativeEngine = (this.containerEngine as any).nativeEngine || this.containerEngine;
        if (nativeEngine.isExternalProject !== undefined) {
          nativeEngine.isExternalProject = true;
        }

        // Tell the native agent which app is selected so per-app storage settings work
        if (nativeEngine.setSelectedApp) {
          const selectedApp = this.detectedConfig()?.selectedApp || null;
          nativeEngine.setSelectedApp(selectedApp).catch(() => {});
        }

        // Load tailwind prefix override from project settings (if any)
        if (nativeEngine.getStorageSettings) {
          try {
            const selectedApp = this.detectedConfig()?.selectedApp || undefined;
            const settings = await nativeEngine.getStorageSettings(selectedApp);
            if (settings.tailwindPrefix) {
              this.tailwindPrefixOverride.set(settings.tailwindPrefix);
            }
            if (settings.fixedPort !== undefined) {
              nativeEngine.fixedPort.set(settings.fixedPort);
            }
          } catch { /* ignore */ }
        }

        // Use detected config commands for external projects, fall back to kit commands
        const detected = this.detectedConfig();
        const kitCommands = this.currentKit()?.commands;
        const installCmd = detected?.commands?.install || kitCommands?.install;
        const devCmd = detected?.commands?.dev || kitCommands?.dev;
        const devServerPreset = detected?.devServerPreset || kitCommands?.devServerPreset;
        const externalCommands = devCmd || devServerPreset
          ? { ...kitCommands, dev: devCmd, devServerPreset, install: installCmd } as KitCommands
          : kitCommands;

        // Skip install if node_modules already exists (external projects manage their own deps).
        // When install is needed (first open or after dependency changes), use `ci` for speed.
        let skipInstall = false;
        try {
          const entries = await this.containerEngine.readdir('node_modules');
          if (entries && entries.length > 0) {
            skipInstall = true;
          }
        } catch {
          // node_modules doesn't exist or readdir failed — need to install
        }

        if (!skipInstall) {
          // Prefer `ci` over `install` for faster, deterministic installs
          const ciCmd = installCmd
            ? { cmd: installCmd.cmd, args: installCmd.args.map((a: string) => a === 'install' ? 'ci' : a) }
            : undefined;
          const exitCode = await this.containerEngine.runInstall(ciCmd);
          if (isStale()) return;
          if (exitCode !== 0) return;
        }

        this.containerEngine.startDevServer(externalCommands);
      } else {
        // Standard project flow — disable injecting proxy
        const nativeEngineStd = (this.containerEngine as any).nativeEngine || this.containerEngine;
        if (nativeEngineStd.isExternalProject !== undefined) {
          nativeEngineStd.isExternalProject = false;
        }

        // Full clean when switching kit templates to clear stale node_modules/lockfiles
        await this.containerEngine.clean(!!kitTemplate);
        if (isStale()) return;

        // Yield before heavy sync operations
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Use kit template if provided, otherwise use current kit template
        const baseFiles = kitTemplate || this.currentKitTemplate() || {};
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

        const kitCommands = this.currentKit()?.commands;

        // Skip install if node_modules already exists — saves significant time on repeat opens.
        let skipInstallLocal = false;
        try {
          const entries = await this.containerEngine.readdir('node_modules');
          if (entries && entries.length > 0) {
            skipInstallLocal = true;
            console.log('[reloadPreview] node_modules exists, skipping install');
          }
        } catch { /* node_modules absent — need to install */ }

        let exitCode = 0;
        if (!skipInstallLocal) {
          exitCode = await this.containerEngine.runInstall(kitCommands?.install);
          if (isStale()) return;
        }

        if (exitCode === 0) {
          this.containerEngine.startDevServer(kitCommands);
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'CLOUD_EDITOR_ACCESS_DENIED') {
        this.cloudEditorBlocked.set('access_denied');
      } else if (err?.code === 'CONTAINER_CAPACITY_REACHED') {
        this.cloudEditorBlocked.set('capacity');
      }
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load kit template files for a given kit
   */
  async loadKitTemplate(kitId: string): Promise<KitFileTree | null> {
    try {
      const result = await this.apiService.getKit(kitId).toPromise();
      if (result?.kit) {
        this.currentKit.set(result.kit);
        if (result.kit.template?.files) {
          return result.kit.template.files;
        }
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

  /**
   * Fetch a file's content from disk via the container engine and populate it in the store.
   * Used for external projects where the store is loaded with structure-only (empty contents).
   * Returns the content, or null if the fetch fails.
   */
  async readFileIntoStore(filePath: string): Promise<string | null> {
    try {
      const content = await this.containerEngine.readFile(filePath);
      this.fileStore.updateFile(filePath, content);
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Get file content from the store, fetching from disk if not yet loaded (structure-only mode).
   * Returns null if the file doesn't exist in the store at all.
   */
  async getFileContent(filePath: string): Promise<string | null> {
    const stored = this.fileStore.getFileContent(filePath);
    if (stored === null) return null; // file not in store
    if (stored !== '') return stored; // already loaded
    // Empty string means structure-only placeholder — fetch from disk
    return this.readFileIntoStore(filePath);
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
        } else if (files[key].file.encoding === 'base64') {
          // Preserve binary encoding (e.g. PNG read from disk as base64)
          tree[key] = { file: { contents: content, encoding: 'base64' } };
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
          /\.(png|jpg|jpeg|gif|webp|ico|pdf|eot|ttf|woff|woff2)$/i.test(
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
