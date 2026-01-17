import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ContainerEngine, ProcessOutput } from './container-engine';
import { WebContainerFiles } from '@adorable/shared-types';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocalContainerEngine extends ContainerEngine {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3333/api/container';

  // State
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

  async boot(): Promise<void> {
    this.status.set('Booting Local Container...');
    try {
      await this.http.post(`${this.apiUrl}/start`, {}).toPromise();
      this.status.set('Container Ready');
    } catch (e) {
      this.status.set('Boot Failed');
      console.error(e);
      throw e;
    }
  }

  async teardown(): Promise<void> {
    await this.http.post(`${this.apiUrl}/stop`, {}).toPromise();
    this.status.set('Stopped');
  }

  async mount(files: WebContainerFiles): Promise<void> {
    this.status.set('Mounting files...');
    await this.http.post(`${this.apiUrl}/mount`, { files }).toPromise();
  }

  async exec(cmd: string, args: string[], options?: any): Promise<ProcessOutput> {
    // For now, simple one-shot exec. Streaming is harder over HTTP without WS.
    // We'll fake the stream with the full output at the end for this MVP.
    const req = this.http.post<{ output: string, exitCode: number }>(`${this.apiUrl}/exec`, { cmd, args, ...options });
    const result = await req.toPromise();
    
    return {
      stream: of(result!.output),
      exit: Promise.resolve(result!.exitCode)
    };
  }

  async runInstall(): Promise<number> {
    this.status.set('Installing dependencies...');
    const res = await this.exec('npm', ['install']);
    this.serverOutput.update(o => o + (res as any).stream?.value || ''); // Hacky stream access
    // We should subscribe to stream
    res.stream.subscribe(chunk => this.serverOutput.update(o => o + chunk));
    return await res.exit;
  }

  async startDevServer(): Promise<void> {
    this.status.set('Starting dev server...');
    // In local docker, we might need to expose ports or use a reverse proxy.
    // For MVP, let's just run the command and assume we can't easily preview it yet without port mapping logic.
    // Or we use 'npm start' and capture logs.
    const res = await this.exec('npm', ['start']);
    res.stream.subscribe(chunk => this.serverOutput.update(o => o + chunk));
    this.status.set('Dev Server Running (Logs only)');
  }

  async stopDevServer(): Promise<void> {
    // TODO: Kill process
  }

  async clean(): Promise<void> {
    await this.exec('rm', ['-rf', 'src']);
  }

  // Not implemented fully for Remote/Local yet
  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
     // Optimize: sending single file mount
     // Need to convert to WebContainerFiles structure
     console.warn('writeFile not optimized for LocalContainerEngine');
  }
  
  async readFile(path: string): Promise<string> { return ''; }
  async readBinaryFile(path: string): Promise<Uint8Array> { return new Uint8Array(); }
  async deleteFile(path: string): Promise<void> {}
  async startShell(): Promise<void> {}
  async writeToShell(data: string): Promise<void> {}
  async runBuild(args?: string[]): Promise<number> { return 0; }
  async readdir(path: string): Promise<any> { return []; }
  
  on(event: 'server-ready', callback: (port: number, url: string) => void): void {}
}
