import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';

@Injectable({
  providedIn: 'root'
})
export class WebContainerService {
  private webcontainerInstance?: WebContainer;
  private serverProcess?: any;
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
    await this.webcontainerInstance!.mount(files);
  }

  async runInstall() {
    const installProcess = await this.webcontainerInstance!.spawn('npm', ['install']);
    installProcess.output.pipeTo(new WritableStream({
      write: (data) => this.output.update(o => o + data)
    }));
    return installProcess.exit;
  }

  async startDevServer() {
        console.log('web-container:  start dev server');

    if (this.serverProcess) {
      this.serverProcess.kill();
    }

    // Pass --allowed-hosts=all to ensure HMR works in the WebContainer iframe
    // Set VITE_HMR env variables to force HMR to use WSS on port 443
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
}