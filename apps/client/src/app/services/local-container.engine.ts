import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ContainerEngine, ProcessOutput } from './container-engine';
import { FileTree } from '@adorable/shared-types';
import { Observable, of, shareReplay } from 'rxjs';
import { getServerUrl } from './server-url';

@Injectable({
  providedIn: 'root'
})
export class LocalContainerEngine extends ContainerEngine {
  private http = inject(HttpClient);
  private apiUrl = getServerUrl() + '/api/container';

  // State
  public mode = signal<'local' | 'native'>('local');
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
      await this.http.post(`${this.apiUrl}/start`, { projectId: this.currentProjectId }).toPromise();
      this.lastBootedProjectId = this.currentProjectId;
      this.status.set('Container Ready');
    } catch (e) {
      this.status.set('Boot Failed');
      console.error(e);
      throw e;
    }
  }

  // No file watcher needed — Angular CLI handles HMR directly, and the AI
  // agent's file writes already come through the streaming protocol.
  startFileWatcher(): void {}
  stopFileWatcher(): void {}

  async teardown(): Promise<void> {
    this.stopFileWatcher();
    await this.http.post(`${this.apiUrl}/stop`, {}).toPromise();
    this.status.set('Stopped');
  }

  private lastBootedProjectId: string | null = null;

  async mount(files: FileTree): Promise<void> {
    // Reboot if container isn't running or if we switched to a different project
    const needsReboot = this.status() === 'Idle' || this.status() === 'Stopped' || this.status() === 'Server stopped'
      || (this.currentProjectId && this.currentProjectId !== this.lastBootedProjectId);
    if (needsReboot) {
        await this.boot();
    }

    this.status.set('Mounting files...');
    await this.http.post(`${this.apiUrl}/mount`, { files }).toPromise();
  }

  override async mountProject(projectId: string, kitId: string | null): Promise<void> {
    const needsReboot = this.status() === 'Idle' || this.status() === 'Stopped' || this.status() === 'Server stopped'
      || (this.currentProjectId && this.currentProjectId !== this.lastBootedProjectId);
    if (needsReboot) {
        await this.boot();
    }

    this.status.set('Mounting files...');
    await this.http.post(`${this.apiUrl}/mount-project`, { projectId, kitId, baseHref: '/api/proxy/' }).toPromise();
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

  private async streamExec(cmd: string, args: string[], env?: any): Promise<ProcessOutput> {
      const token = localStorage.getItem('adorable_token');
      // Using fetch for streaming response
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
    const userId = JSON.parse(localStorage.getItem('adorable_user') || '{}').id;
    // Pass --host 0.0.0.0 to ensure it listens on all interfaces for Docker networking
    const res = await this.exec('npm', ['start', '--', '--host=0.0.0.0', '--allowed-hosts=all'], {
        stream: true
    });
    
    res.stream.subscribe(chunk => {
        this.serverOutput.update(o => o + chunk);
        // Strip ANSI codes for logic checks
        // eslint-disable-next-line no-control-regex
        const clean = chunk.replace(/\x1B\[[0-9;]*[mK]/g, '');
        
        if (clean.includes('Application bundle generation complete')) {
             const userId = JSON.parse(localStorage.getItem('adorable_user') || '{}').id;
             const serverBase = getServerUrl();
             const proxyUrl = `${serverBase}/api/proxy/?user=${userId}`;
             
             // Small delay before setting URL to ensure server is actually listening and stable
             setTimeout(() => {
                this.url.set(proxyUrl);
                this.status.set('Ready');
                this.startFileWatcher();
                this.onServerReady(4200, proxyUrl);
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
    this.url.set(null); // Clear URL immediately
    try {
      // 1. Check if anything is actually listening on 4200 before killing
      // 2. Try killing anything on port 4200 specifically (most reliable)
      // 3. Fallback to pkill for node/npm/ng processes
      const res = await this.exec('sh', ['-c', 'fuser 4200/tcp && (fuser -k 4200/tcp || pkill -9 -f "node|npm|ng") || echo "Port already free"']);
      await res.exit;

      // Poll until port 4200 is free instead of blind sleep
      await this.waitForPortFree(4200, 5000);

      this.status.set('Server stopped');
    } catch (e) {
      console.warn('Failed to stop dev server', e);
    } finally {
      this.isStopping = false;
    }
  }

  private async waitForPortFree(port: number, timeoutMs: number): Promise<void> {
    const pollInterval = 200;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const res = await this.exec('sh', ['-c', `fuser ${port}/tcp`]);
        const exitCode = await res.exit;
        // Non-zero exit = nothing listening on the port = port is free
        if (exitCode !== 0) return;
      } catch {
        // exec failure means port is free (or container gone, either way safe to proceed)
        return;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    // Timeout reached — proceed anyway (safety net)
  }

  async clean(full = false): Promise<void> {
    // The container bind-mounts storage/projects/{id} to /app, so we must
    // NEVER rm -rf src — that would delete the project's source from disk.
    // mount() overwrites files in place, git checkout handles version restore,
    // and project switches get a fresh bind mount via container reboot.
    try {
      if (full) {
        // Only remove node_modules/caches on kit/template change (different deps)
        await this.exec('rm', ['-rf', 'node_modules', 'pnpm-lock.yaml', 'package-lock.json', '.angular']);
      } else {
        await this.exec('rm', ['-rf', '.angular']);
      }
    } catch {
      // Ignore — container may not be running yet; nothing to clean
    }
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
        const base64 = btoa(String.fromCharCode(...content));
        current[fileName] = { file: { contents: base64, encoding: 'base64' } };
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