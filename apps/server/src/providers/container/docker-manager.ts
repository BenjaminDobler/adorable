import Docker from 'dockerode';
import { Readable, Writable } from 'stream';
import * as tar from 'tar-stream';
import * as path from 'path';
import * as fs from 'fs/promises';

export class DockerManager {
  private docker: Docker;
  private container: Docker.Container | null = null;
  private userId: string | null = null;

  constructor() {
    const socketPath =
      process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath });
  }

  async createContainer(image = 'node:20', name?: string) {
    await this.ensureImage(image);

    // Extract userId from name if possible (adorable-user-name-userId)
    if (name) {
       const parts = name.split('-');
       this.userId = parts[parts.length - 1];
    }

    // 1. Check if container already exists
    if (name) {
      try {
        const existing = await this.docker.getContainer(name);
        const info = await existing.inspect();
        this.container = existing;
        
        // Ensure userId is tracked if we re-use
        if (!this.userId) {
           const parts = name.split('-');
           this.userId = parts[parts.length - 1];
        }

        if (info.State.Paused) {
          console.log(`[Docker] Unpausing existing container: ${name}`);
          await this.container.unpause();
        } else if (!info.State.Running) {
          console.log(`[Docker] Starting existing container: ${name}`);
          await this.container.start();
        } else {
          console.log(`[Docker] Using already running container: ${name}`);
        }
        return this.container.id;
      } catch (e) {
        // Container doesn't exist, proceed to create
        console.log(`[Docker] Container ${name} not found, creating fresh.`);
      }
    }

    const hostAppPath = path.join(process.cwd(), 'storage', 'projects', this.userId || 'unknown');
    await fs.mkdir(hostAppPath, { recursive: true });

    this.container = await this.docker.createContainer({
      Image: image,
      name: name,
      Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'], // Keep alive
      Tty: true,
      WorkingDir: '/app',
      HostConfig: {
        Binds: [`${hostAppPath}:/app`],
        PortBindings: {
          '4200/tcp': [{ HostIp: '0.0.0.0', HostPort: '0' }], // Random host port
        },
      },
      ExposedPorts: {
        '4200/tcp': {},
      },
    });

    await this.container.start();

    // Ensure psmisc (for fuser) is installed for robust port cleanup
    console.log('[Docker] Installing cleanup tools...');
    try {
       const installExec = await this.container.exec({
          Cmd: ['sh', '-c', 'apt-get update && apt-get install -y psmisc'],
          User: 'root'
       });
       const stream = await installExec.start({ Detach: false });
       await new Promise((resolve) => {
          this.container?.modem.demuxStream(stream as any, process.stdout, process.stderr);
          (stream as any).on('end', resolve);
       });
    } catch(e) {
       console.warn('[Docker] Failed to install psmisc, cleanup might be less reliable', e.message);
    }

    return this.container.id;
  }

  async pause() {
    if (this.container) {
      const info = await this.container.inspect();
      if (info.State.Running && !info.State.Paused) {
        await this.container.pause();
      }
    }
  }

  async unpause() {
    if (this.container) {
      const info = await this.container.inspect();
      if (info.State.Paused) {
        await this.container.unpause();
      }
    }
  }

  async getContainerUrl(): Promise<string> {
    if (!this.container) throw new Error('Container not started');
    
    // Auto-unpause or start if accessing URL
    const info = await this.container.inspect();
    if (info.State.Paused) {
       await this.container.unpause();
    } else if (!info.State.Running) {
       await this.container.start();
    }

    const data = await this.container.inspect();
    const ports = data.NetworkSettings.Ports['4200/tcp'];
    if (ports && ports[0]) {
      // On macOS, always use 127.0.0.1 for the host side of mapping
      return `http://127.0.0.1:${ports[0].HostPort}`;
    }
    throw new Error('Port not mapped');
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
          this.docker.modem.followProgress(stream, (err: any, res: any) =>
            err ? reject(err) : resolve(res),
          );
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
      path: '/app',
    });
  }

  async exec(
    cmd: string[],
    workDir = '/app',
    env?: any,
  ): Promise<{ output: string; exitCode: number }> {
    if (!this.container) throw new Error('Container not started');

    // Auto-unpause if needed
    const info = await this.container.inspect();
    if (info.State.Paused) {
       await this.container.unpause();
    } else if (!info.State.Running) {
       await this.container.start();
    }

    const envArray = env
      ? Object.entries(env).map(([k, v]) => `${k}=${v}`)
      : [];

    const exec = await this.container.exec({
      Cmd: cmd,

      AttachStdout: true,

      AttachStderr: true,

      WorkingDir: workDir,

      Env: envArray,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    return new Promise((resolve, reject) => {
      let output = '';

      // Demuxing to separate stdout/stderr if needed, but here combining.

      // Using 'any' cast for modem/stream because dockerode types are tricky with streams.

      this.container?.modem.demuxStream(
        stream as any,
        {
          write: (chunk: any) => (output += chunk.toString()),
        } as any,
        {
          write: (chunk: any) => (output += chunk.toString()),
        } as any,
      );

      (stream as any).on('end', async () => {
        const inspect = await exec.inspect();

        resolve({ output, exitCode: inspect.ExitCode });
      });

      (stream as any).on('error', reject);
    });
  }

  async execStream(
    cmd: string[],
    workDir = '/app',
    onData: (chunk: string) => void,
    env?: any,
  ): Promise<number> {
    if (!this.container) throw new Error('Container not started');

    // Auto-unpause if needed
    const info = await this.container.inspect();
    if (info.State.Paused) {
       await this.container.unpause();
    } else if (!info.State.Running) {
       await this.container.start();
    }

    const envArray = env
      ? Object.entries(env).map(([k, v]) => `${k}=${v}`)
      : [];

    const exec = await this.container.exec({
      Cmd: cmd,

      AttachStdout: true,

      AttachStderr: true,

      WorkingDir: workDir,

      Env: envArray,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    return new Promise((resolve, reject) => {
      this.container?.modem.demuxStream(
        stream as any,
        {
          write: (chunk: any) => onData(chunk.toString()),
        } as any,
        {
          write: (chunk: any) => onData(chunk.toString()),
        } as any,
      );

      (stream as any).on('end', async () => {
        // Wait a bit for inspection?

        try {
          const inspect = await exec.inspect();

          resolve(inspect.ExitCode);
        } catch (e) {
          resolve(-1);
        }
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
