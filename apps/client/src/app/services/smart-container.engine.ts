import { Injectable, inject, signal, computed, Signal } from '@angular/core';
import { ContainerEngine, ProcessOutput } from './container-engine';
import { BrowserContainerEngine } from './browser-container.engine';
import { LocalContainerEngine } from './local-container.engine';
import { WebContainerFiles } from '@adorable/shared-types';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root'
})
export class SmartContainerEngine extends ContainerEngine {
  private browserEngine = inject(BrowserContainerEngine);
  private localEngine = inject(LocalContainerEngine);

  // Active Engine Mode
  public mode = signal<'browser' | 'local'>('browser');
  
  private activeEngine = computed(() => 
    this.mode() === 'local' ? this.localEngine : this.browserEngine
  );

  // --- Proxy Signals ---
  
  // We need to proxy the signals. Since activeEngine changes, we can use computed.
  // Re-defining properties as Computed
  override get status(): Signal<string> { return computed(() => this.activeEngine().status()); }
  override get url(): Signal<string | null> { return computed(() => this.activeEngine().url()); }
  override get buildError(): Signal<string | null> { return computed(() => this.activeEngine().buildError()); }
  override get previewConsoleLogs(): Signal<any[]> { return computed(() => this.activeEngine().previewConsoleLogs()); }
  override get serverOutput(): Signal<string> { return computed(() => this.activeEngine().serverOutput()); }
  override get shellOutput(): Signal<string> { return computed(() => this.activeEngine().shellOutput()); }

  _status = signal('Idle'); // Legacy cleanup
  _url = signal<string|null>(null);
  _buildError = signal<string|null>(null);
  _previewConsoleLogs = signal<any[]>([]);
  _serverOutput = signal('');
  _shellOutput = signal('');

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
  async mount(files: WebContainerFiles) { await this.activeEngine().mount(files); }
  async writeFile(path: string, content: string | Uint8Array) { await this.activeEngine().writeFile(path, content); }
  async readFile(path: string) { return await this.activeEngine().readFile(path); }
  async readBinaryFile(path: string) { return await this.activeEngine().readBinaryFile(path); }
  async deleteFile(path: string) { await this.activeEngine().deleteFile(path); }
  async clean() { await this.activeEngine().clean(); }
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
    // This is tricky. We need to re-bind listener when engine changes?
    // For now, assume listener is attached once.
    // Better: Forward the event.
    this.browserEngine.on(event, callback);
    this.localEngine.on(event, callback);
  }
  
  setMode(mode: 'browser' | 'local') {
      console.log('Switching Container Engine to:', mode);
      // Teardown previous?
      const prev = this.activeEngine();
      prev.stopDevServer(); 
      // prev.teardown(); // Optional, maybe keep warm?
      
      this.mode.set(mode);
  }
}
