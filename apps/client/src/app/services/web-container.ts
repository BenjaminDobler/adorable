import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';

@Injectable({
  providedIn: 'root'
})
export class WebContainerService {
  private webcontainerInstance?: WebContainer;
  private serverProcess?: any;
  private lastPackageJson: string | null = null;
  
  public url = signal<string | null>(null);
  public isBooting = signal<boolean>(false);
  public output = signal<string>('');

  async boot() {
    if (this.webcontainerInstance) return;
    
    this.isBooting.set(true);
    try {
      this.webcontainerInstance = await WebContainer.boot();
      this.isBooting.set(false);
    } catch (err) {
      console.error('Failed to boot WebContainer', err);
      this.isBooting.set(false);
      throw err;
    }
  }

  async mount(files: any) {
    if (!this.webcontainerInstance) await this.boot();
    // TODO: Consider cleaning 'src' to avoid ghost files when switching projects completely
    await this.webcontainerInstance!.mount(files);
  }

  async runInstall() {
    try {
      const packageJson = await this.webcontainerInstance!.fs.readFile('package.json', 'utf-8');
      if (this.lastPackageJson === packageJson) {
        this.output.update(o => o + 'Dependencies unchanged, skipping npm install...\n');
        return 0;
      }
      this.lastPackageJson = packageJson;
    } catch (e) {
      // package.json might not exist yet or read failed
    }

    const installProcess = await this.webcontainerInstance!.spawn('npm', ['install']);
    installProcess.output.pipeTo(new WritableStream({
      write: (data) => this.output.update(o => o + data)
    }));
    return installProcess.exit;
  }

  async stopDevServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = undefined;
    }
  }

  async clean() {
    if (!this.webcontainerInstance) return;
    try {
      const process = await this.webcontainerInstance.spawn('rm', ['-rf', 'src']);
      await process.exit;
    } catch (e) {
      console.error('Failed to clean src directory', e);
    }
  }

  async startDevServer() {
    console.log('web-container:  start dev server');

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
    
    serverProcess.output.pipeTo(new WritableStream({
      write: (data) => {
        this.output.update(o => o + data);
      }
    }));


    this.webcontainerInstance!.on('server-ready', (port, url) => {
      this.url.set(url);
    });
  } 

    async writeFile(path: string, contents: string) {

      console.log('eb-container:  Writing file:', path);

      await this.webcontainerInstance!.fs.writeFile(path, contents);

    }

  

      async runBuild(args: string[] = []) {

  

        console.log('web-container:  running npm run build', args);

  

        const buildProcess = await this.webcontainerInstance!.spawn('npm', ['run', 'build', '--', ...args]);

  

        buildProcess.output.pipeTo(new WritableStream({

  

          write: (data) => this.output.update(o => o + data)

  

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

  