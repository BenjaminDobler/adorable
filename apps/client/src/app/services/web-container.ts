import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';

@Injectable({
  providedIn: 'root'
})
export class WebContainerService {
  private webcontainerInstance?: WebContainer;
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
    const serverProcess = await this.webcontainerInstance!.spawn('npm', ['run', 'start']);
    
    serverProcess.output.pipeTo(new WritableStream({
      write: (data) => this.output.update(o => o + data)
    }));

    this.webcontainerInstance!.on('server-ready', (port, url) => {
      this.url.set(url);
    });
  }

  async writeFile(path: string, contents: string) {
    await this.webcontainerInstance!.fs.writeFile(path, contents);
  }
}