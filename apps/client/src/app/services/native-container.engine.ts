import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ContainerEngine, ProcessOutput } from './container-engine';
import { FileSystemStore } from './file-system.store';
import { WebContainerFiles } from '@adorable/shared-types';
import { Observable, of, shareReplay } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NativeContainerEngine extends ContainerEngine {
  private http = inject(HttpClient);
  private fileStore = inject(FileSystemStore);
  // In desktop mode, native ops go to the local agent (port 3334)
  private apiUrl = ((window as any).electronAPI?.nativeAgentUrl || 'http://localhost:3334') + '/api/native';
  private watchAbort: AbortController | null = null;

  // State
  public mode = signal<'local' | 'native'>('native');
  public status = signal<string>('Idle');
  public url = signal<string | null>(null);
  public buildError = signal<string | null>(null);
  public previewConsoleLogs = signal<any[]>([]);
  public serverOutput = signal<string>('');
  public shellOutput = signal<string>('');

  addConsoleLog(log: any) {
    this.previewConsoleLogs.update(l => [...l, { ...log, timestamp: new Date() }]);
  }

  clearServerOutput() { this.serverOutput.set(''); }
  clearShellOutput() { this.shellOutput.set(''); }
  clearPreviewLogs() { this.previewConsoleLogs.set([]); }
  clearBuildError() { this.buildError.set(null); }

  private lastBootedProjectId: string | null = null;

  async boot(): Promise<void> {
    this.status.set('Starting native project...');
    try {
      await this.http.post(`${this.apiUrl}/start`, { projectId: this.currentProjectId }).toPromise();
      this.lastBootedProjectId = this.currentProjectId;
      this.status.set('Project Ready');
    } catch (e) {
      this.status.set('Boot Failed');
      console.error(e);
      throw e;
    }
  }

  startFileWatcher(): void {
    this.stopFileWatcher();
    const token = localStorage.getItem('adorable_token');
    const abort = new AbortController();
    this.watchAbort = abort;

    fetch(`${this.apiUrl}/watch`, {
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
      signal: abort.signal,
    }).then(response => {
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();

      const push = () => {
        reader.read().then(({ done, value }) => {
          if (done) return;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === 'changed') {
                  this.fileStore.updateFile(data.path, data.content);
                } else if (data.type === 'deleted') {
                  this.fileStore.deleteFile(data.path);
                }
              } catch { /* partial JSON, skip */ }
            }
          }
          push();
        }).catch(() => { /* aborted or connection lost */ });
      };
      push();
    }).catch(() => { /* aborted or network error */ });
  }

  stopFileWatcher(): void {
    if (this.watchAbort) {
      this.watchAbort.abort();
      this.watchAbort = null;
    }
  }

  async teardown(): Promise<void> {
    this.stopFileWatcher();
    await this.http.post(`${this.apiUrl}/stop`, {}).toPromise();
    this.status.set('Stopped');
  }

  async mount(files: WebContainerFiles): Promise<void> {
    const needsReboot = this.status() === 'Idle' || this.status() === 'Stopped' || this.status() === 'Server stopped'
      || (this.currentProjectId && this.currentProjectId !== this.lastBootedProjectId);
    if (needsReboot) {
      await this.boot();
    }
    this.status.set('Mounting files...');

    // Use setTimeout to move JSON.stringify off the current call stack
    // This allows the UI to remain responsive during serialization
    await new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        try {
          const body = JSON.stringify({ files });
          await fetch(`${this.apiUrl}/mount`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  }

  override async mountProject(projectId: string, kitId: string | null): Promise<void> {
    const needsReboot = this.status() === 'Idle' || this.status() === 'Stopped' || this.status() === 'Server stopped'
      || (this.currentProjectId && this.currentProjectId !== this.lastBootedProjectId);
    if (needsReboot) {
      await this.boot();
    }
    this.status.set('Mounting files...');
    // Call the server's endpoint (port 3333), not the local-agent's (port 3334),
    // since the server does the file preparation and both share the same directory
    const serverUrl = 'http://localhost:3333/api/container';
    const token = localStorage.getItem('adorable_token');
    await fetch(`${serverUrl}/mount-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ projectId, kitId })
    });
  }

  async exec(cmd: string, args: string[], options?: any): Promise<ProcessOutput> {
    try {
      if (options?.stream) {
        return this.streamExec(cmd, args, options?.env);
      }

      const req = this.http.post<{ output: string, exitCode: number }>(`${this.apiUrl}/exec`, { cmd, args, env: options?.env, ...options });
      const result = await req.toPromise();

      return {
        stream: of(result!.output),
        exit: Promise.resolve(result!.exitCode)
      };
    } catch (e: any) {
      const errorMsg = e.error?.error || '';
      if (errorMsg === 'Project not initialized') {
        console.log('Native project not initialized, booting...');
        await this.boot();
        if (options?.stream) {
          return this.streamExec(cmd, args);
        }
        const req = this.http.post<{ output: string, exitCode: number }>(`${this.apiUrl}/exec`, { cmd, args, ...options });
        const result = await req.toPromise();
        return {
          stream: of(result!.output),
          exit: Promise.resolve(result!.exitCode)
        };
      }
      throw e;
    }
  }

  private async streamExec(cmd: string, args: string[], env?: any): Promise<ProcessOutput> {
    const token = localStorage.getItem('adorable_token');
    const response = await fetch(`${this.apiUrl}/exec-stream?cmd=${cmd}&args=${args.join(',')}&env=${env ? encodeURIComponent(JSON.stringify(env)) : ''}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include'
    });

    if (!response.ok) {
      const text = await response.text();
      let errorJson;
      try { errorJson = JSON.parse(text); } catch(e) {}
      if (errorJson && errorJson.error) {
        throw { error: { error: errorJson.error } };
      }
      throw new Error(text);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const stream = new Observable<string>(observer => {
      if (!reader) { observer.complete(); return; }

      const push = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            observer.complete();
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.output) observer.next(data.output);
                if (data.done) observer.complete();
                if (data.error) observer.error(data.error);
              } catch(e) {}
            }
          }
          push();
        });
      };
      push();
    });

    const shared = stream.pipe(shareReplay());

    const exitPromise = new Promise<number>((resolve, reject) => {
      shared.subscribe({
        complete: () => resolve(0),
        error: (err) => reject(err)
      });
    });

    return {
      stream: shared,
      exit: exitPromise
    };
  }

  async runInstall(): Promise<number> {
    this.status.set('Installing dependencies...');
    const res = await this.exec('npm', ['install'], { stream: true });
    res.stream.subscribe(chunk => this.serverOutput.update(o => o + chunk));
    return await res.exit;
  }

  async startDevServer(): Promise<void> {
    this.status.set('Starting dev server...');
    // Use --port=0 to get a random free port, or a specific port
    const res = await this.exec('npm', ['start', '--', '--port=0'], {
      stream: true
    });

    res.stream.subscribe(chunk => {
      this.serverOutput.update(o => o + chunk);
      // Strip ANSI codes for logic checks
      // eslint-disable-next-line no-control-regex
      const clean = chunk.replace(/\x1B\[[0-9;]*[mK]/g, '');

      // Detect the dev server URL from Angular CLI output
      const urlMatch = clean.match(/Local:\s+(https?:\/\/localhost:\d+)/);
      if (urlMatch) {
        const devUrl = urlMatch[1];
        setTimeout(() => {
          this.url.set(devUrl);
          this.status.set('Ready');
          this.startFileWatcher();
          this.onServerReady(parseInt(new URL(devUrl).port), devUrl);
        }, 1000);
      } else if (clean.includes('Application bundle generation complete') && !this.url()) {
        // Fallback: if we didn't catch the URL, try localhost:4200
        setTimeout(() => {
          if (!this.url()) {
            const fallbackUrl = 'http://localhost:4200';
            this.url.set(fallbackUrl);
            this.status.set('Ready');
            this.startFileWatcher();
            this.onServerReady(4200, fallbackUrl);
          }
        }, 2000);
      }
    });
  }

  private isStopping = false;

  async stopDevServer(): Promise<void> {
    if (this.isStopping) return;
    this.isStopping = true;

    this.stopFileWatcher();
    this.status.set('Stopping dev server...');
    this.url.set(null);

    try {
      // Call the native stop endpoint with a timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch(`${this.apiUrl}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      }).catch(() => {});

      clearTimeout(timeoutId);
      this.status.set('Server stopped');
    } catch (e) {
      // Ignore errors - project may already be stopped or timed out
      console.warn('Stop dev server timeout/error (continuing anyway)', e);
      this.status.set('Idle');
    } finally {
      this.isStopping = false;
    }
  }

  async clean(full = false): Promise<void> {
    await this.exec('rm', ['-rf', 'src']);
    if (full) {
      // Only remove node_modules on explicit full clean (e.g. kit/template change)
      await this.exec('rm', ['-rf', 'node_modules', 'pnpm-lock.yaml', 'package-lock.json', '.angular']);
    } else {
      // Preserve node_modules for faster project switching
      await this.exec('rm', ['-rf', '.angular']);
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const parts = path.split('/');
    const fileName = parts.pop()!;
    const tree: any = {};
    let current = tree;
    for (const part of parts) {
      current[part] = { directory: {} };
      current = current[part].directory;
    }

    if (typeof content === 'string') {
      current[fileName] = { file: { contents: content } };
    } else {
      let binary = '';
      const len = content.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(content[i]);
      }
      current[fileName] = { file: { contents: btoa(binary), encoding: 'base64' } };
    }

    await this.mount(tree);
  }

  async readFile(path: string): Promise<string> { return ''; }
  async readBinaryFile(path: string): Promise<Uint8Array> { return new Uint8Array(); }
  async deleteFile(path: string): Promise<void> {}
  async mkdir(path: string): Promise<void> {
    await this.exec('mkdir', ['-p', path]);
  }
  async startShell(): Promise<void> {}
  async writeToShell(data: string): Promise<void> {}
  async runBuild(args?: string[]): Promise<number> { return 0; }
  async readdir(path: string, options?: any): Promise<any> { return []; }

  onServerReadyCallback?: (port: number, url: string) => void;
  on(event: 'server-ready', callback: (port: number, url: string) => void): void {
    this.onServerReadyCallback = callback;
  }
  private onServerReady(port: number, url: string) {
    this.onServerReadyCallback?.(port, url);
  }
}
