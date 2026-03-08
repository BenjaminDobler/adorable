import { Injectable, inject, signal, computed, Signal } from '@angular/core';
import { ContainerEngine, ProcessOutput } from './container-engine';
import { LocalContainerEngine } from './local-container.engine';
import { NativeContainerEngine } from './native-container.engine';
import { FileTree } from '@adorable/shared-types';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';

export type ContainerMode = 'local' | 'native';

/** Detect if running inside Electron desktop app */
export function isDesktopApp(): boolean {
  return !!(window as any).electronAPI?.isDesktop;
}

function getDefaultMode(): ContainerMode {
  if (isDesktopApp()) return 'native';
  return (localStorage.getItem('container_mode') as ContainerMode) || 'local';
}

@Injectable({
  providedIn: 'root'
})
export class SmartContainerEngine extends ContainerEngine {
  private localEngine = inject(LocalContainerEngine);
  private nativeEngine = inject(NativeContainerEngine);

  // Active Engine Mode — desktop app forces native
  public mode = signal<ContainerMode>(getDefaultMode());

  private activeEngine = computed(() => {
    switch (this.mode()) {
      case 'native': return this.nativeEngine;
      default: return this.localEngine;
    }
  });

  // --- Proxy Signals ---

  // We need to proxy the signals. Since activeEngine changes, we can use computed.
  // Re-defining properties as Computed
  override get status(): Signal<string> { return computed(() => this.activeEngine().status()); }
  override get url(): Signal<string | null> { return computed(() => this.activeEngine().url()); }
  override get buildError(): Signal<string | null> { return computed(() => this.activeEngine().buildError()); }
  override get previewConsoleLogs(): Signal<any[]> { return computed(() => this.activeEngine().previewConsoleLogs()); }
  override get serverOutput(): Signal<string> { return computed(() => this.activeEngine().serverOutput()); }
  override get shellOutput(): Signal<string> { return computed(() => this.activeEngine().shellOutput()); }

  override set currentProjectId(value: string | null) {
    super.currentProjectId = value;
    this.localEngine.currentProjectId = value;
    this.nativeEngine.currentProjectId = value;
  }
  override get currentProjectId(): string | null {
    return super.currentProjectId;
  }

  constructor() {
    super();
  }

  addConsoleLog(log: any) { this.activeEngine().addConsoleLog(log); }

  clearServerOutput() { this.activeEngine().clearServerOutput(); }
  clearShellOutput() { this.activeEngine().clearShellOutput(); }
  clearPreviewLogs() { this.activeEngine().clearPreviewLogs(); }
  clearBuildError() { this.activeEngine().clearBuildError(); }

  async boot() { await this.activeEngine().boot(); }
  async teardown() { await this.activeEngine().teardown(); }
  async mount(files: FileTree) { await this.activeEngine().mount(files); }
  override async mountProject(projectId: string, kitId: string | null) { await this.activeEngine().mountProject?.(projectId, kitId); }
  async writeFile(path: string, content: string | Uint8Array) { await this.activeEngine().writeFile(path, content); }
  async readFile(path: string) { return await this.activeEngine().readFile(path); }
  async readBinaryFile(path: string) { return await this.activeEngine().readBinaryFile(path); }
  async deleteFile(path: string) { await this.activeEngine().deleteFile(path); }
  async mkdir(path: string) { await this.activeEngine().mkdir(path); }
  async clean(full?: boolean) { await this.activeEngine().clean(full); }
  async startShell() { await this.activeEngine().startShell(); }
  async readdir(path: string, options?: any) { return await this.activeEngine().readdir(path, options); }

  async exec(cmd: string, args: string[], options?: any): Promise<ProcessOutput> {
    return await this.activeEngine().exec(cmd, args, options);
  }
  async writeToShell(data: string) { await this.activeEngine().writeToShell(data); }
  async runBuild(args?: string[]) { return await this.activeEngine().runBuild(args); }
  async runInstall() { return await this.activeEngine().runInstall(); }
  async startDevServer() { await this.activeEngine().startDevServer(); }
  async stopDevServer() { await this.activeEngine().stopDevServer(); }

  on(event: 'server-ready', callback: (port: number, url: string) => void) {
    this.localEngine.on(event, callback);
    this.nativeEngine.on(event, callback);
  }

  setMode(mode: ContainerMode) {
      console.log('Switching Container Engine to:', mode);
      const prev = this.activeEngine();
      prev.stopDevServer();

      this.mode.set(mode);
      localStorage.setItem('container_mode', mode);
  }
}
