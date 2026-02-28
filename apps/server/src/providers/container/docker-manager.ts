import Docker from 'dockerode';
import { Readable, Writable } from 'stream';
import * as tar from 'tar-stream';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'chokidar';

export class DockerManager {
  private docker: Docker;
  private container: Docker.Container | null = null;
  private userId: string | null = null;
  private projectId: string | null = null;
  private recreationLock: Promise<void> | null = null;

  // File watcher
  public readonly events = new EventEmitter();
  private watcher: FSWatcher | null = null;
  private recentWrites = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    const socketPath =
      process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath });
  }

  setProjectId(projectId: string) {
    this.projectId = projectId;
  }

  getProjectId(): string | null {
    return this.projectId;
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

        // Ensure userId is tracked if we re-use
        if (!this.userId) {
           const parts = name.split('-');
           this.userId = parts[parts.length - 1];
        }

        // Check if bind mount matches the current projectId — if not, recreate
        const expectedHostPath = this.projectId
          ? path.join(process.cwd(), 'storage', 'projects', this.projectId)
          : path.join(process.cwd(), 'storage', 'projects', this.userId || 'unknown');
        const currentBinds = info.HostConfig?.Binds || [];
        const currentAppBind = currentBinds.find((b: string) => b.endsWith(':/app'));
        const currentHostPath = currentAppBind ? currentAppBind.split(':/app')[0] : '';

        if (currentHostPath && path.resolve(currentHostPath) !== path.resolve(expectedHostPath)) {
          console.log(`[Docker] Project changed (${currentHostPath} → ${expectedHostPath}), recreating container.`);
          // Null out immediately so concurrent callers see no container
          this.container = null;
          let resolveLock: () => void;
          this.recreationLock = new Promise<void>(r => { resolveLock = r; });
          try {
            this.stopWatcher();
            try { await existing.stop({ t: 2 }); } catch (_) { /* may already be stopped */ }
            try { await existing.remove({ force: true }); } catch (_) { /* ignore */ }
          } finally {
            // Lock is resolved after the new container is created below,
            // but store resolveLock so we can call it at the end of createContainer.
            // For now, attach it to a temporary field.
            (this as any)._resolveLock = resolveLock!;
          }
          // Fall through to create a new container below
        } else {
          this.container = existing;
          if (info.State.Paused) {
            console.log(`[Docker] Unpausing existing container: ${name}`);
            await this.container.unpause();
          } else if (!info.State.Running) {
            console.log(`[Docker] Starting existing container: ${name}`);
            try {
              await this.container.start();
            } catch (e: any) {
              if (e.statusCode === 304) {
                // 304 = already running, benign
              } else {
                // Container is in a bad state (port conflict, etc.) — remove and recreate
                console.warn(`[Docker] Failed to start existing container, removing and recreating:`, e.message || e);
                this.container = null;
                try { await existing.remove({ force: true }); } catch (_) { /* ignore */ }
                // Fall through to create a new container below
              }
            }
          } else {
            console.log(`[Docker] Using already running container: ${name}`);
          }
          if (this.container) return this.container.id;
        }
      } catch (e) {
        // Container doesn't exist, proceed to create
        console.log(`[Docker] Container ${name} not found, creating fresh.`);
      }
    }

    const hostAppPath = this.projectId
      ? path.join(process.cwd(), 'storage', 'projects', this.projectId)
      : path.join(process.cwd(), 'storage', 'projects', this.userId || 'unknown');
    await fs.mkdir(hostAppPath, { recursive: true });

    this.container = await this.docker.createContainer({
      Image: image,
      name: name,
      Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'], // Keep alive
      Tty: true,
      WorkingDir: '/app',
      User: `${process.getuid()}:${process.getgid()}`, // Match host user so bind-mounted files stay writable
      HostConfig: {
        Binds: [`${hostAppPath}:/app`],
        PortBindings: {
          '4200/tcp': [{ HostIp: '0.0.0.0', HostPort: '0' }], // Random host port
        },
        Memory: 1024 * 1024 * 1024, // 1GB RAM limit
        CpuPeriod: 100000,
        CpuQuota: 100000, // 1 CPU core
      },
      ExposedPorts: {
        '4200/tcp': {},
      },
    });

    try {
      await this.container.start();
    } catch (e: any) {
      if (e.statusCode === 304) {
        // 304 = already running, benign
      } else {
        // Start failed (port conflict, etc.) — remove and retry once with a fresh container
        console.warn(`[Docker] New container failed to start, retrying:`, e.message || e);
        try { await this.container.remove({ force: true }); } catch (_) { /* ignore */ }
        this.container = await this.docker.createContainer({
          Image: image,
          name: name, // Reuse same name (old one was removed above)
          Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'],
          Tty: true,
          WorkingDir: '/app',
          User: `${process.getuid()}:${process.getgid()}`,
          HostConfig: {
            Binds: [`${hostAppPath}:/app`],
            PortBindings: { '4200/tcp': [{ HostIp: '0.0.0.0', HostPort: '0' }] },
            Memory: 1024 * 1024 * 1024,
            CpuPeriod: 100000,
            CpuQuota: 100000,
          },
          ExposedPorts: { '4200/tcp': {} },
        });
        await this.container.start();
      }
    }

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

    // Resolve recreation lock if this was a project-switch recreation
    if ((this as any)._resolveLock) {
      (this as any)._resolveLock();
      (this as any)._resolveLock = null;
      this.recreationLock = null;
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

  isRunning(): boolean {
    return this.container !== null;
  }

  async getContainerInfo(): Promise<{ containerId: string; containerName: string; hostProjectPath: string; containerWorkDir: string; status: string } | null> {
    if (!this.container) return null;
    const info = await this.container.inspect();
    const hostPath = this.projectId
      ? path.resolve(process.cwd(), 'storage', 'projects', this.projectId)
      : path.resolve(process.cwd(), 'storage', 'projects', this.userId || 'unknown');
    return {
      containerId: info.Id,
      containerName: info.Name.replace(/^\//, ''),
      hostProjectPath: hostPath,
      containerWorkDir: '/app',
      status: info.State.Status
    };
  }

  startWatcher(): void {
    if (this.watcher) return; // Already watching
    const hostPath = this.projectId
      ? path.resolve(process.cwd(), 'storage', 'projects', this.projectId)
      : path.resolve(process.cwd(), 'storage', 'projects', this.userId || 'unknown');
    console.log(`[Docker] Starting file watcher on ${hostPath}`);

    const ignoredDirs = new Set(['node_modules', '.angular', '.nx', 'dist', '.git', '.cache', 'tmp']);
    const ignoredFiles = new Set(['.DS_Store']);
    this.watcher = watch(hostPath, {
      ignoreInitial: true,
      ignored: (filePath: string) => {
        const relative = path.relative(hostPath, filePath);
        const parts = relative.split(path.sep);
        const fileName = parts[parts.length - 1];
        return parts.some(p => ignoredDirs.has(p)) || ignoredFiles.has(fileName);
      },
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('error', (err: Error) => {
      console.warn('[Docker] File watcher error (non-fatal):', err.message);
    });

    const handleChange = (type: 'changed' | 'deleted', filePath: string) => {
      const relative = path.relative(hostPath, filePath);
      // Skip files we wrote ourselves (feedback loop prevention)
      if (this.recentWrites.has(relative)) return;

      // Debounce per-file
      const existing = this.debounceTimers.get(relative);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(relative, setTimeout(async () => {
        this.debounceTimers.delete(relative);
        if (type === 'changed') {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            this.events.emit('file-changed', { path: relative, content });
          } catch {
            // File may have been deleted between detection and read
          }
        } else {
          this.events.emit('file-deleted', { path: relative });
        }
      }, 300));
    };

    this.watcher.on('add', (fp: string) => handleChange('changed', fp));
    this.watcher.on('change', (fp: string) => handleChange('changed', fp));
    this.watcher.on('unlink', (fp: string) => handleChange('deleted', fp));
  }

  stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.debounceTimers.forEach(t => clearTimeout(t));
      this.debounceTimers.clear();
      console.log(`[Docker] Stopped file watcher`);
    }
  }

  private trackRecentWrites(files: any, prefix = '') {
    for (const key in files) {
      const node = files[key];
      const filePath = prefix + key;
      if (node.file) {
        this.recentWrites.add(filePath);
        setTimeout(() => this.recentWrites.delete(filePath), 2000);
      } else if (node.directory) {
        this.trackRecentWrites(node.directory, filePath + '/');
      }
    }
  }

  async getContainerUrl(): Promise<string> {
    await this.ensureRunning();

    // Retry briefly — port mapping may not be immediately available after start
    for (let attempt = 0; attempt < 3; attempt++) {
      const data = await this.container!.inspect();
      const ports = data.NetworkSettings.Ports['4200/tcp'];
      if (ports && ports[0]) {
        return `http://127.0.0.1:${ports[0].HostPort}`;
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 500));
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

  private async ensureRunning(): Promise<void> {
    if (this.recreationLock) await this.recreationLock;
    if (!this.container) throw new Error('Container not started');
    const info = await this.container.inspect();
    if (info.State.Paused) {
      await this.container.unpause();
    } else if (!info.State.Running) {
      try {
        await this.container.start();
      } catch (e: any) {
        if (e.statusCode !== 304) throw e;
        // 304 = already running, benign
      }
    }
  }

  async copyFiles(files: any) {
    if (!this.container) throw new Error('Container not started');

    // Track writes to prevent watcher feedback loop
    this.trackRecentWrites(files);

    const pack = tar.pack();

    const addFiles = (tree: any, prefix = '') => {
      for (const key in tree) {
        if (key === '.DS_Store') continue; // Skip macOS metadata files
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
    await this.ensureRunning();

    const envArray = env
      ? Object.entries(env).map(([k, v]) => `${k}=${v}`)
      : [];

    const exec = await this.container!.exec({
      Cmd: cmd,

      AttachStdout: true,

      AttachStderr: true,

      WorkingDir: workDir,

      Env: envArray,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    return new Promise((resolve, reject) => {
      let output = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.warn(`[Docker] exec timed out after 120s: ${cmd.join(' ')}`);
          resolve({ output: output + '\n[Command timed out after 120s]', exitCode: 124 });
        }
      }, 120_000);

      this.container!.modem.demuxStream(
        stream as any,
        {
          write: (chunk: any) => (output += chunk.toString()),
        } as any,
        {
          write: (chunk: any) => (output += chunk.toString()),
        } as any,
      );

      (stream as any).on('end', async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const inspect = await exec.inspect();
        resolve({ output, exitCode: inspect.ExitCode });
      });

      (stream as any).on('error', (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async execStream(
    cmd: string[],
    workDir = '/app',
    onData: (chunk: string) => void,
    env?: any,
  ): Promise<number> {
    await this.ensureRunning();

    const envArray = env
      ? Object.entries(env).map(([k, v]) => `${k}=${v}`)
      : [];

    const exec = await this.container!.exec({
      Cmd: cmd,

      AttachStdout: true,

      AttachStderr: true,

      WorkingDir: workDir,

      Env: envArray,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    return new Promise((resolve, reject) => {
      this.container!.modem.demuxStream(
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
    this.stopWatcher();
    if (this.container) {
      await this.container.stop();
      await this.container.remove();
      this.container = null;
    }
  }
}
