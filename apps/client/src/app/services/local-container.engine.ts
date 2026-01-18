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
  public mode = signal<'browser' | 'local'>('local');
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
    // We assume boot() starts the container. 
    // We should check if container is running? 
    // Ideally the server handles idempotency of start, or we track state locally.
    // For now, let's call boot if status is Idle or Stopped.
    if (this.status() === 'Idle' || this.status() === 'Stopped') {
        await this.boot();
    }

    this.status.set('Mounting files...');
    await this.http.post(`${this.apiUrl}/mount`, { files }).toPromise();
  }

  async exec(cmd: string, args: string[], options?: any): Promise<ProcessOutput> {
    try {
        if (options?.stream) {
           return this.streamExec(cmd, args);
        }
    
        const req = this.http.post<{ output: string, exitCode: number }>(`${this.apiUrl}/exec`, { cmd, args, ...options });
        const result = await req.toPromise();
        
        return {
          stream: of(result!.output),
          exit: Promise.resolve(result!.exitCode)
        };
    } catch (e: any) {
        const errorMsg = e.error?.error || '';
        if (errorMsg === 'Container not started' || errorMsg.includes('container state improper')) {
            console.log('Container connection lost or stopped, rebooting...');
            await this.boot();
            // Retry once
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

  private async streamExec(cmd: string, args: string[]): Promise<ProcessOutput> {
      const token = localStorage.getItem('adorable_token');
      // Using fetch for streaming response
      const response = await fetch(`${this.apiUrl}/exec-stream?cmd=${cmd}&args=${args.join(',')}`, {
          headers: { 'Authorization': `Bearer ${token}` }
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
                  // Parse SSE format "data: {...}"
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

      return {
          stream,
          exit: Promise.resolve(0)
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
    // Pass --host 0.0.0.0 to ensure it listens on all interfaces for Docker networking
    // Pass --poll 2000 to detect changes in Docker volume/putArchive updates
    const res = await this.exec('npm', ['start', '--', '--host=0.0.0.0', '--allowed-hosts=all', '--poll=2000'], { stream: true });
    
    res.stream.subscribe(chunk => {
        this.serverOutput.update(o => o + chunk);
        // Strip ANSI codes for logic checks
        // eslint-disable-next-line no-control-regex
        const clean = chunk.replace(/\x1B\[[0-9;]*[mK]/g, '');
        
        if (clean.includes('Application bundle generation complete')) {
             this.url.set('http://localhost:3333/api/proxy/'); 
             this.status.set('Ready');
             this.onServerReady(4200, 'http://localhost:3333/api/proxy/');
        }
    });
  }

  async stopDevServer(): Promise<void> {
    // TODO: Kill process
  }

  async clean(): Promise<void> {
    await this.exec('rm', ['-rf', 'src']);
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
     const parts = path.split('/');
     const fileName = parts.pop()!;
     const tree: any = {};
     let current = tree;
     for(const part of parts) {
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
  async startShell(): Promise<void> {}
  async writeToShell(data: string): Promise<void> {}
  async runBuild(args?: string[]): Promise<number> { return 0; }
  async readdir(path: string): Promise<any> { return []; } 
  
  onServerReadyCallback?: (port: number, url: string) => void;
  on(event: 'server-ready', callback: (port: number, url: string) => void): void {
      this.onServerReadyCallback = callback;
  }
  private onServerReady(port: number, url: string) {
      this.onServerReadyCallback?.(port, url);
  }
}