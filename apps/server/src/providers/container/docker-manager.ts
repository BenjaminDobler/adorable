import Docker from 'dockerode';
import { Readable, Writable } from 'stream';
import * as tar from 'tar-stream';

export class DockerManager {
  private docker: Docker;
  private container: Docker.Container | null = null;

  constructor() {
    const socketPath = process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath }); 
  }

  async createContainer(image = 'node:20-slim') {
    await this.ensureImage(image);

    this.container = await this.docker.createContainer({
      Image: image,
      Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'], // Keep alive
      Tty: true,
      WorkingDir: '/app',
      HostConfig: {
        PortBindings: {
            '4200/tcp': [{ HostIp: '0.0.0.0', HostPort: '4201' }] // Fixed host port for debugging
        }
      },
      ExposedPorts: {
          '4200/tcp': {}
      }
    });

    await this.container.start();
    return this.container.id;
  }

  async getContainerUrl(): Promise<string> {
      if (!this.container) throw new Error('Container not started');
      return 'http://127.0.0.1:4201';
  }

  private async ensureImage(image: string) {
      try {
          const img = this.docker.getImage(image);
          await img.inspect();
      } catch (e) {
          console.log(`Image ${image} not found, pulling...`);
          await new Promise((resolve, reject) => {
              this.docker.pull(image, (err: any, stream: any) => {
                  if (err) return reject(err);
                  this.docker.modem.followProgress(stream, (err: any, res: any) => err ? reject(err) : resolve(res));
              });
          });
          console.log(`Image ${image} pulled.`);
      }
  }

  async copyFiles(files: any) {
    if (!this.container) throw new Error('Container not started');

    const pack = tar.pack();

    const addFiles = (tree: any, prefix = '') => {
      for (const key in tree) {
        const node = tree[key];
        const path = prefix + key;
        if (node.file) {
          const content = node.file.contents;
          // Handle base64 if needed, but assuming string/buffer
          if (node.file.encoding === 'base64') {
             pack.entry({ name: path }, Buffer.from(content, 'base64'));
          } else {
             pack.entry({ name: path }, content);
          }
        } else if (node.directory) {
          pack.entry({ name: path + '/', type: 'directory' }); // Explicit dir entry
          addFiles(node.directory, path + '/');
        }
      }
    };

    addFiles(files);
    pack.finalize();

    await this.container.putArchive(pack, {
      path: '/app'
    });
  }

  async exec(cmd: string[], workDir = '/app'): Promise<{ output: string, exitCode: number }> {
    if (!this.container) throw new Error('Container not started');

    const exec = await this.container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: workDir
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    
    return new Promise((resolve, reject) => {
        let output = '';
        // Demuxing to separate stdout/stderr if needed, but here combining.
        // Using 'any' cast for modem/stream because dockerode types are tricky with streams.
        this.container?.modem.demuxStream(stream as any, {
            write: (chunk: any) => output += chunk.toString()
        } as any, {
            write: (chunk: any) => output += chunk.toString()
        } as any);

        (stream as any).on('end', async () => {
            const inspect = await exec.inspect();
            resolve({ output, exitCode: inspect.ExitCode });
        });
        
        (stream as any).on('error', reject);
    });
  }



  async execStream(cmd: string[], workDir = '/app', onData: (chunk: string) => void): Promise<number> {
    if (!this.container) throw new Error('Container not started');

    const exec = await this.container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: workDir
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    
    return new Promise((resolve, reject) => {
        this.container?.modem.demuxStream(stream as any, {
            write: (chunk: any) => onData(chunk.toString())
        } as any, {
            write: (chunk: any) => onData(chunk.toString())
        } as any);

        (stream as any).on('end', async () => {
            // Wait a bit for inspection?
            try {
               const inspect = await exec.inspect();
               resolve(inspect.ExitCode);
            } catch(e) { resolve(-1); }
        });
        
        (stream as any).on('error', reject);
    });
  }

  async stop() {
    if (this.container) {
      await this.container.stop();
      await this.container.remove();
      this.container = null;
    }
  }
}
