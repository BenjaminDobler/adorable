import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';
import { ContainerEngine, ProcessOutput } from './container-engine';
import { WebContainerFiles } from '@adorable/shared-types';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BrowserContainerEngine extends ContainerEngine {
  private webcontainerInstance?: WebContainer;
  private serverProcess?: any;
  private shellProcess?: any;
  private lastPackageJson: string | null = null;
  
  // Public Signals
  public mode = signal<'browser' | 'local' | 'native'>('browser');
  public status = signal<string>('Idle');
  public isBooting = signal<boolean>(false);
  public serverOutput = signal<string>('');
  public shellOutput = signal<string>('');
  public previewConsoleLogs = signal<Array<{ level: 'log'|'warn'|'error', message: string, timestamp: Date }>>([]);
  public buildError = signal<string | null>(null);
  public url = signal<string | null>(null);

  addConsoleLog(log: { level: 'log'|'warn'|'error', message: string }) {
    this.previewConsoleLogs.update(logs => [...logs, { ...log, timestamp: new Date() }]);
  }

  clearServerOutput() { this.serverOutput.set(''); }
  clearShellOutput() { this.shellOutput.set(''); }
  clearPreviewLogs() { this.previewConsoleLogs.set([]); }
  clearBuildError() { this.buildError.set(null); }

  async boot() {
    if (this.webcontainerInstance) return;
    
    this.status.set('Booting WebContainer...');
    this.isBooting.set(true);
    try {
      this.webcontainerInstance = await WebContainer.boot();
      this.isBooting.set(false);
      this.startShell(); // Start the shell immediately
    } catch (err) {
      this.status.set('Boot failed');
      console.error('Failed to boot WebContainer', err);
      this.isBooting.set(false);
      throw err;
    }
  }

  async teardown() {
    this.webcontainerInstance?.teardown();
    this.webcontainerInstance = undefined;
  }

  async startShell() {
    if (this.shellProcess) return;
    try {
      this.shellProcess = await this.webcontainerInstance!.spawn('jsh');
      this.shellProcess.output.pipeTo(new WritableStream({
        write: (data) => {
          this.shellOutput.update(o => {
            const val = o + data;
            return val.length > 50000 ? val.slice(-50000) : val;
          });
        }
      }));
    } catch (e) {
      console.error('Failed to start shell', e);
    }
  }

  async writeToShell(data: string) {
    if (!this.shellProcess) await this.startShell();
    const writer = this.shellProcess.input.getWriter();
    await writer.write(data);
    writer.releaseLock();
  }

  async mount(files: WebContainerFiles) {
      this.status.set('Mounting files...');
      if (!this.webcontainerInstance) await this.boot();
      await this.webcontainerInstance!.mount(files as any);
  }
  
  async runInstall(): Promise<number> {
      this.status.set('Checking dependencies...');
      try {
        const packageJson = await this.webcontainerInstance!.fs.readFile('package.json', 'utf-8');
        if (this.lastPackageJson === packageJson) {
          this.serverOutput.update(o => o + 'Dependencies unchanged, skipping pnpm install...\n');
          this.status.set('Dependencies up to date');
          return 0;
        }
        this.lastPackageJson = packageJson;
      } catch (e) {
        // package.json might not exist yet or read failed
      }
  
    this.status.set('Installing dependencies...');
    const installProcess = await this.webcontainerInstance!.spawn('pnpm', ['install']);
    installProcess.output.pipeTo(new WritableStream({
      write: (data) => this.serverOutput.update(o => o + data)
    }));
    return installProcess.exit;
  }

  async stopDevServer() {
      this.url.set(null);
      this.status.set('Stopping dev server...');
      
      if (this.serverProcess) {
        this.serverProcess.kill();
        await this.serverProcess.exit;
        this.serverProcess = undefined;
      }
      this.status.set('Server stopped');
  }
  
  async clean(full = false) {
      if (!this.webcontainerInstance) return;
      this.status.set('Cleaning workspace...');
      try {
        const process = await this.webcontainerInstance.spawn('rm', ['-rf', 'src']);
        await process.exit;
      } catch (e) {
        console.error('Failed to clean src directory', e);
      }

      if (full) {
        // Full clean: remove node_modules, lockfiles, and caches so a fresh install happens
        this.lastPackageJson = null;
        try {
          const rmDeps = await this.webcontainerInstance.spawn('rm', ['-rf', 'node_modules', 'pnpm-lock.yaml', 'package-lock.json', '.angular']);
          await rmDeps.exit;
        } catch (e) {
          console.error('Failed to clean dependencies', e);
        }
      }
  }
  
  async startDevServer() {
      console.log('web-container:  start dev server');
      this.status.set('Starting dev server...');
      this.buildError.set(null);
  
      await this.stopDevServer();
  
      // Pass --allowed-hosts=all to ensure HMR works in the WebContainer iframe
      // Set VITE_HMR env variables to force HMR to use WSS on port 443
      console.log('WebContainer booting completed');
      const serverProcess = await this.webcontainerInstance!.spawn('pnpm', ['run', 'start'], {
        env: {
          VITE_HMR_PROTOCOL: 'wss',
          VITE_HMR_PORT: '443'
        }
      });
      this.serverProcess = serverProcess;
      
      let errorBuffer = '';
      let hasErrors = false;
  
      serverProcess.output.pipeTo(new WritableStream({
            write: (data) => {
              this.serverOutput.update(o => {
                const val = o + data;
                return val.length > 50000 ? val.slice(-50000) : val;
              });
  
              // Simple status parsing
              // eslint-disable-next-line no-control-regex
              const clean = data.replace(/\x1B\[[0-9;]*[mK]/g, ''); // Strip colors
      
              if (clean.includes('Building...')) {
                this.status.set('Building...');
                errorBuffer = ''; // Reset error buffer on new build
                hasErrors = false;
                this.buildError.set(null);
              } 
              
              if (clean.includes('[ERROR]') || clean.includes('✘') || clean.includes('Error:')) {
                console.log('Build error detected');
                this.status.set('Build Error');
                hasErrors = true;
              }
              
              if (hasErrors) {
                 errorBuffer += clean;
                 this.buildError.set(errorBuffer);
              }
    
              if ((clean.includes('Application bundle generation failed') || clean.includes('Build failed')) && hasErrors) {
                 this.buildError.set(errorBuffer);
              }
    
              if (clean.includes('Application bundle generation complete')) {
                this.status.set('Ready');
                this.buildError.set(null); // Clear errors
                hasErrors = false;
              }
            }
      }));
  
      this.webcontainerInstance!.on('server-ready', (port, url) => {
        this.url.set(url);
        this.status.set('Server Ready');
      });
  }

  async writeFile(path: string, contents: string | Uint8Array) {
      console.log('web-container:  Writing file:', path);
      await this.webcontainerInstance!.fs.writeFile(path, contents);
  }

  async readFile(path: string): Promise<string> {
      return await this.webcontainerInstance!.fs.readFile(path, 'utf-8');
  }

  async readBinaryFile(path: string): Promise<Uint8Array> {
      return await this.webcontainerInstance!.fs.readFile(path);
  }

  async deleteFile(path: string): Promise<void> {
      await this.webcontainerInstance!.fs.rm(path, { recursive: true });
  }

  async mkdir(path: string): Promise<void> {
      await this.webcontainerInstance!.fs.mkdir(path, { recursive: true });
  }

  async exec(cmd: string, args: string[], options?: any): Promise<ProcessOutput> {
      // Not fully implemented for generic exec yet, specialized methods used
      // But creating a wrapper:
      const process = await this.webcontainerInstance!.spawn(cmd, args, options);
      const stream = new Observable<string>(observer => {
          process.output.pipeTo(new WritableStream({
              write: (data) => observer.next(data)
          })).then(() => observer.complete());
      });
      return { stream, exit: process.exit };
  }

  async runBuild(args: string[] = []) {
      console.log('web-container:  running pnpm run build', args);
      const buildProcess = await this.webcontainerInstance!.spawn('pnpm', ['run', 'build', ...args]);
      
      buildProcess.output.pipeTo(new WritableStream({
          write: (data) => this.serverOutput.update(o => o + data)
      }));
      return buildProcess.exit;
  }

  async readdir(path: string, options?: { withFileTypes: boolean }) {
      return await this.webcontainerInstance!.fs.readdir(path, options as any);
  }
  
  on(event: 'server-ready', callback: (port: number, url: string) => void) {
      this.webcontainerInstance!.on(event, callback);
  }
}
