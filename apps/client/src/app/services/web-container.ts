import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';

@Injectable({
  providedIn: 'root'
})
export class WebContainerService {
  private webcontainerInstance?: WebContainer;
  private serverProcess?: any;
  private shellProcess?: any;
  private lastPackageJson: string | null = null;
  
  public url = signal<string | null>(null);
  public isBooting = signal<boolean>(false);
  public serverOutput = signal<string>('');
  public shellOutput = signal<string>('');
  public previewConsoleLogs = signal<Array<{ level: 'log'|'warn'|'error', message: string, timestamp: Date }>>([]);
  
  public status = signal<string>('Idle');
  public buildError = signal<string | null>(null);

  addConsoleLog(log: { level: 'log'|'warn'|'error', message: string }) {
    this.previewConsoleLogs.update(logs => [...logs, { ...log, timestamp: new Date() }]);
  }

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

  async mount(files: any) {

      this.status.set('Mounting files...');
      if (!this.webcontainerInstance) await this.boot();
      // TODO: Consider cleaning 'src' to avoid ghost files when switching projects completely
      await this.webcontainerInstance!.mount(files);
    }
  
    async runInstall() {
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
    const installProcess = await this.webcontainerInstance!.spawn('npm', ['install']);
    installProcess.output.pipeTo(new WritableStream({
      write: (data) => this.serverOutput.update(o => o + data)
    }));
    return installProcess.exit;
  }

  async stopDevServer() {
      if (this.serverProcess) {
        this.serverProcess.kill();
        this.serverProcess = undefined;
        this.url.set(null);
        this.status.set('Server stopped');
      }
    }
  
    async clean() {
      if (!this.webcontainerInstance) return;
      this.status.set('Cleaning workspace...');
      try {
        const process = await this.webcontainerInstance.spawn('rm', ['-rf', 'src']);
        await process.exit;
      } catch (e) {
        console.error('Failed to clean src directory', e);
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
      const serverProcess = await this.webcontainerInstance!.spawn('npm', ['run', 'start'], {
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
              const clean = data.replace(/\x1B\[\d+m/g, ''); // Strip colors
      
          if (clean.includes('Building...')) {
            this.status.set('Building...');
            errorBuffer = ''; // Reset error buffer on new build
            hasErrors = false;
            this.buildError.set(null);
          } 
          
          if (clean.includes('[ERROR]')) {
            this.status.set('Build Error');
            hasErrors = true;
          }
          
          if (hasErrors) {
             errorBuffer += clean;
          }

          if (clean.includes('Application bundle generation failed') && hasErrors) {
             // Build finished with errors
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
      console.log('eb-container:  Writing file:', path);
      await this.webcontainerInstance!.fs.writeFile(path, contents);
    }

  

      async runBuild(args: string[] = []) {

  

        console.log('web-container:  running npm run build', args);

  

                const buildProcess = await this.webcontainerInstance!.spawn('npm', ['run', 'build', '--', ...args]);

  

        

  

                buildProcess.output.pipeTo(new WritableStream({

  

        

  

                  write: (data) => this.serverOutput.update(o => o + data)

  

        

  

                }));

  

        

  

        return buildProcess.exit;

  

      }

  

    

  

    async readdir(path: string, options?: { withFileTypes: boolean }) {

      return await this.webcontainerInstance!.fs.readdir(path, options as any);

    }

  

    async readFile(path: string) {

      return await this.webcontainerInstance!.fs.readFile(path, 'utf-8');

    }

  

    async readBinaryFile(path: string) {

      return await this.webcontainerInstance!.fs.readFile(path);

    }

  }

  