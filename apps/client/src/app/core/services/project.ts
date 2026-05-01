import { Injectable, inject, signal, computed, Signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { ApiService } from './api';
import { ContainerEngine } from './container-engine';
import { ToastService } from './toast';
import { Router } from '@angular/router';
import { RUNTIME_SCRIPTS } from '../models/runtime-scripts';
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
import { ChatHistoryStore, ChatMessage, Question, QuestionOption, PendingQuestion } from './chat-history.store';
import { KitManagementStore } from './kit-management.store';
import { ProjectExportService } from './project-export.service';
import { dataURIToUint8Array as binaryDataURIToUint8Array } from './binary-file.utils';

// Re-export chat types so existing consumers keep working without an import update.
export type { ChatMessage, Question, QuestionOption, PendingQuestion };

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
  // Chat-related state moved to a dedicated store. ProjectService re-exposes
  // it via getters/wrappers below so existing consumers keep working; new
  // chat-only consumers (chat.component, versions panel, etc.) can inject
  // ChatHistoryStore directly.
  public chatHistory = inject(ChatHistoryStore);
  // Kit-related state — same delegation pattern.
  public kits = inject(KitManagementStore);
  // Build / publish / download flows — see project-export.service.ts.
  private exportService = inject(ProjectExportService);

  // Guard against concurrent loadProject/reloadPreview calls (fast project switching)
  private _loadEpoch = 0;

  // Emitted when switching projects so active generation streams can be cancelled
  readonly projectSwitching$ = new Subject<void>();

  // State
  projectId = signal<string | null>(null);
  projectName = signal<string>('');
  /** Whether this project has been persisted to the database at least once. */
  isSaved = signal(false);
  /** Absolute path to an external project directory (desktop "Open Folder" feature). */
  externalPath = signal<string | null>(null);
  /** Auto-detected config for external projects (commands, preset, etc.). */
  detectedConfig = signal<any>(null);
  /** Active locale selected in the Translations panel — used by visual editor to target the right file. */
  activeTranslationLocale = signal<string>('');

  // Kit state delegated to KitManagementStore — exposed as getters so callers
  // can still do `projectService.selectedKitId.set(...)` etc. without changes.
  get selectedKitId() { return this.kits.selectedKitId; }
  get currentKit() { return this.kits.currentKit; }
  get currentKitTemplate() { return this.kits.currentKitTemplate; }
  get tailwindPrefixOverride() { return this.kits.tailwindPrefixOverride; }

  // Use store for files
  files: Signal<FileTree> = this.fileStore.files;

  // Delegated to ChatHistoryStore — kept as getters so callers can still do
  // `projectService.messages()` and `projectService.debugLogs()`.
  get messages() { return this.chatHistory.messages; }
  get debugLogs() { return this.chatHistory.debugLogs; }

  loading = signal(false);
  cloudEditorBlocked = signal<'capacity' | 'access_denied' | null>(null);
  buildError = signal<string | null>(null);
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
        firstValueFrom(this.apiService.loadProject(id)),
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
        this.chatHistory.setMessages(
          project.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        );
      } else {
        this.chatHistory.clear();
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
    try {
      await this.exportService.publish(id, visibility);
    } finally {
      this.loading.set(false);
    }
  }

  async downloadZip() {
    if (this.fileStore.isEmpty()) return;
    this.loading.set(true);
    try {
      await this.exportService.downloadZip(this.projectName() || 'adorable-app', this.files());
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

    // Ensure the container engine knows which project we're working with.
    // For new unsaved projects (no ID yet), generate a temporary unique ID so the
    // native agent creates a fresh directory instead of reusing the shared 'desktop'
    // fallback — which causes cross-project contamination.
    if (!this.projectId()) {
      this.containerEngine.currentProjectId = 'new-' + crypto.randomUUID();
    } else {
      this.containerEngine.currentProjectId = this.projectId();
    }

    // Yield to allow loading state to render
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (isStale()) return;

    // Fast paths: skip the full stop/install/start cycle when we can.
    if (!kitTemplate && this.projectId() && this.containerEngine.checkStatus) {
      if (await this.tryFastReconnect()) return;
    }
    if (!kitTemplate && this.containerEngine.url()) {
      if (await this.tryFastRemount(files, isStale)) return;
    }

    try {
      if (!skipStop) {
        await Promise.race([
          this.containerEngine.stopDevServer(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }
      if (isStale()) return;

      if (this.externalPath()) {
        await this.bootExternalProject(files, isStale);
      } else {
        await this.bootStandardProject(files, kitTemplate, isStale);
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
   * Fast path 1 — the container is already running our project with the dev
   * server ready. Skip everything and just point the URL/status signals at it.
   * Returns true on hit (caller should return), false on miss (caller continues).
   */
  private async tryFastReconnect(): Promise<boolean> {
    try {
      const status = await this.containerEngine.checkStatus!();
      if (status.running && status.projectId === this.projectId() && status.devServerReady) {
        const userId = JSON.parse(localStorage.getItem('adorable_user') || '{}').id;
        const serverBase = getServerUrl();
        (this.containerEngine.url as any).set(`${serverBase}/api/proxy/?user=${userId}`);
        (this.containerEngine.status as any).set('Ready');
        this.containerEngine.lastBootedProjectId = this.projectId();
        this.loading.set(false);
        return true;
      }
    } catch {
      // Status check failed — fall through to next fast path or full reload.
    }
    return false;
  }

  /**
   * Fast path 2 — deps haven't changed (same package.json) and the dev server
   * is already running. Just remount the file tree and let HMR pick up changes.
   * Returns true on hit, false on miss.
   */
  private async tryFastRemount(files: any, isStale: () => boolean): Promise<boolean> {
    const currentPkg = this.fileStore.getFileContent('package.json');
    const incomingPkg = files?.['package.json']?.file?.contents ?? null;
    // If incoming files don't include package.json, or it matches the current one, take fast path
    const depsUnchanged = incomingPkg === null || incomingPkg === currentPkg;
    if (!depsUnchanged) return false;

    try {
      const baseFiles = this.currentKitTemplate() || {};
      const mergedFiles = this.mergeFiles(baseFiles, files || {});
      if (isStale()) return true;

      this.fileStore.setFiles(mergedFiles);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (isStale()) return true;

      // External projects: files already live on disk, skip mount to avoid
      // overwriting real files with lazy-loaded empty stubs.
      if (!this.externalPath()) {
        const tree = this.prepareFilesForMount(mergedFiles);
        await this.containerEngine.mount(tree);
        if (isStale()) return true;
      }
      return true;
    } catch (err) {
      if (isStale()) return true;
      console.error('Fast-path reload failed, falling back to full reload', err);
      return false;
    } finally {
      // Mirrors the original behaviour: loading is cleared regardless of
      // whether we hit the fast path or fall through.
      this.loading.set(false);
    }
  }

  /**
   * Boot path for desktop "Open Folder" projects: files already live on disk,
   * NativeManager is pointed at the external path, install runs only if
   * node_modules is missing, then the user's dev command starts.
   */
  private async bootExternalProject(files: any, isStale: () => boolean): Promise<void> {
    if (files && Object.keys(files).length > 0) {
      this.fileStore.setFiles(files);
    }
    if (isStale()) return;

    await this.containerEngine.boot(false, this.externalPath()!);
    if (isStale()) return;

    // Enable injecting proxy so runtime scripts (inspector, console relay)
    // are injected into HTML responses without modifying project files.
    const nativeEngine = (this.containerEngine as any).nativeEngine || this.containerEngine;
    if (nativeEngine.isExternalProject !== undefined) {
      nativeEngine.isExternalProject = true;
    }

    // Tell the native agent which app is selected so per-app storage settings work.
    if (nativeEngine.setSelectedApp) {
      const selectedApp = this.detectedConfig()?.selectedApp || null;
      nativeEngine.setSelectedApp(selectedApp).catch(() => {});
    }

    // Load Tailwind prefix override + fixed port from project settings (if any).
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

    // Detected config commands take precedence; fall back to the kit's commands.
    const detected = this.detectedConfig();
    const kitCommands = this.currentKit()?.commands;
    const installCmd = detected?.commands?.install || kitCommands?.install;
    const devCmd = detected?.commands?.dev || kitCommands?.dev;
    const devServerPreset = detected?.devServerPreset || kitCommands?.devServerPreset;
    const externalCommands = devCmd || devServerPreset
      ? { ...kitCommands, dev: devCmd, devServerPreset, install: installCmd } as KitCommands
      : kitCommands;

    // Skip install when node_modules is present (external projects manage their own deps).
    // First open or after dependency changes uses `ci` for faster, deterministic installs.
    let skipInstall = false;
    try {
      const entries = await this.containerEngine.readdir('node_modules');
      if (entries && entries.length > 0) skipInstall = true;
    } catch {
      // node_modules doesn't exist or readdir failed — need to install.
    }

    if (!skipInstall) {
      const ciCmd = installCmd
        ? { cmd: installCmd.cmd, args: installCmd.args.map((a: string) => a === 'install' ? 'ci' : a) }
        : undefined;
      const exitCode = await this.containerEngine.runInstall(ciCmd);
      if (isStale()) return;
      if (exitCode !== 0) return;
    }

    this.containerEngine.startDevServer(externalCommands);
  }

  /**
   * Boot path for managed projects: clean container, merge kit template into
   * incoming files, mount via projectId (saved) or HTTP (unsaved), install
   * if needed, then start the kit's dev command.
   */
  private async bootStandardProject(
    files: any,
    kitTemplate: KitFileTree | undefined,
    isStale: () => boolean,
  ): Promise<void> {
    // Disable injecting proxy for managed projects.
    const nativeEngine = (this.containerEngine as any).nativeEngine || this.containerEngine;
    if (nativeEngine.isExternalProject !== undefined) {
      nativeEngine.isExternalProject = false;
    }

    // Full clean when switching kit templates to clear stale node_modules / lockfiles.
    await this.containerEngine.clean(!!kitTemplate);
    if (isStale()) return;

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Use kit template if provided, otherwise use the currently loaded one.
    const baseFiles = kitTemplate || this.currentKitTemplate() || {};
    if (kitTemplate) this.currentKitTemplate.set(kitTemplate);

    const mergedFiles = this.mergeFiles(baseFiles, files || {});

    await new Promise((resolve) => setTimeout(resolve, 0));
    if (isStale()) return;

    this.fileStore.setFiles(mergedFiles);

    // Use server-side mount when the project has been saved (has a projectId on disk).
    const pid = this.projectId();
    if (pid && this.isSaved() && this.containerEngine.mountProject) {
      await this.containerEngine.mountProject(pid, this.selectedKitId() || null);
    } else {
      // Fallback for new unsaved projects: send files over HTTP.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const tree = this.prepareFilesForMount(mergedFiles);
      await this.containerEngine.mount(tree);
      if (isStale()) return;
    }
    if (isStale()) return;

    const kitCommands = this.currentKit()?.commands;

    // Skip install when node_modules already exists — saves significant time on repeat opens.
    let skipInstall = false;
    try {
      const entries = await this.containerEngine.readdir('node_modules');
      if (entries && entries.length > 0) {
        skipInstall = true;
        console.log('[reloadPreview] node_modules exists, skipping install');
      }
    } catch { /* node_modules absent — need to install */ }

    let exitCode = 0;
    if (!skipInstall) {
      exitCode = await this.containerEngine.runInstall(kitCommands?.install);
      if (isStale()) return;
    }

    if (exitCode === 0) {
      this.containerEngine.startDevServer(kitCommands);
    }
  }

  /**
   * Load kit template files for a given kit. Delegates to KitManagementStore;
   * kept on ProjectService for back-compat with existing callers.
   */
  async loadKitTemplate(kitId: string): Promise<KitFileTree | null> {
    return this.kits.loadKitTemplate(kitId);
  }

  /**
   * Set the kit for the current project and optionally reload preview.
   * Orchestrates KitManagementStore.setKit (state) with reloadPreview.
   */
  async setKit(kitId: string, reloadPreviewNow = true) {
    const template = await this.kits.setKit(kitId);
    if (template && reloadPreviewNow) {
      await this.reloadPreview(this.files(), template);
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

  // Chat helpers — delegate to ChatHistoryStore (kept here for back-compat
  // with existing consumers; new consumers should call chatHistory directly).
  addSystemMessage(text: string) { this.chatHistory.addSystemMessage(text); }
  addAssistantMessage(text: string) { this.chatHistory.addAssistantMessage(text); }

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

  /**
   * Decode a data URI's base64 payload into a Uint8Array.
   * Thin wrapper around the binary-file utility — kept on this class because
   * workspace.component.ts still calls it via the projectService instance.
   */
  dataURIToUint8Array(dataURI: string): Uint8Array {
    return binaryDataURIToUint8Array(dataURI);
  }
}
