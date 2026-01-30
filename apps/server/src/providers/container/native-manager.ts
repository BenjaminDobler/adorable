import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'chokidar';
import * as os from 'os';

export class NativeManager {
  private projectPath: string | null = null;
  private childProcesses: ChildProcess[] = [];

  // File watcher
  public readonly events = new EventEmitter();
  private watcher: FSWatcher | null = null;
  private recentWrites = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private get baseDir(): string {
    return process.env['ADORABLE_PROJECTS_DIR'] || path.join(os.homedir(), 'adorable-projects');
  }

  async createProject(userId: string, projectName?: string): Promise<string> {
    const dirName = projectName || `project-${userId}`;
    this.projectPath = path.join(this.baseDir, dirName);
    await fs.mkdir(this.projectPath, { recursive: true });
    return this.projectPath;
  }

  isRunning(): boolean {
    return this.projectPath !== null;
  }

  getProjectPath(): string | null {
    return this.projectPath;
  }

  async getProjectInfo(): Promise<{
    projectPath: string;
    status: string;
  } | null> {
    if (!this.projectPath) return null;
    return {
      projectPath: this.projectPath,
      status: 'running',
    };
  }

  // --- File Operations ---

  async copyFiles(files: any): Promise<void> {
    if (!this.projectPath) throw new Error('Project not initialized');
    this.trackRecentWrites(files);
    await this.writeTree(files, this.projectPath);
  }

  private async writeTree(tree: any, basePath: string): Promise<void> {
    for (const key in tree) {
      const node = tree[key];
      const fullPath = path.join(basePath, key);

      if (node.file) {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        if (node.file.encoding === 'base64') {
          await fs.writeFile(fullPath, Buffer.from(node.file.contents, 'base64'));
        } else {
          await fs.writeFile(fullPath, node.file.contents, 'utf-8');
        }
      } else if (node.directory) {
        await fs.mkdir(fullPath, { recursive: true });
        await this.writeTree(node.directory, fullPath);
      }
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

  // --- Command Execution ---

  async exec(
    cmd: string[],
    workDir?: string,
    env?: Record<string, string>,
  ): Promise<{ output: string; exitCode: number }> {
    if (!this.projectPath) throw new Error('Project not initialized');

    const cwd = workDir || this.projectPath;
    const mergedEnv = { ...process.env, ...env };

    return new Promise((resolve, reject) => {
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd,
        env: mergedEnv,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.childProcesses.push(child);
      let output = '';

      child.stdout?.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('close', (code) => {
        this.childProcesses = this.childProcesses.filter((p) => p !== child);
        resolve({ output, exitCode: code ?? 0 });
      });

      child.on('error', (err) => {
        this.childProcesses = this.childProcesses.filter((p) => p !== child);
        reject(err);
      });
    });
  }

  async execStream(
    cmd: string[],
    workDir: string | undefined,
    onData: (chunk: string) => void,
    env?: Record<string, string>,
  ): Promise<number> {
    if (!this.projectPath) throw new Error('Project not initialized');

    const cwd = workDir || this.projectPath;
    const mergedEnv = { ...process.env, ...env };

    return new Promise((resolve, reject) => {
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd,
        env: mergedEnv,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.childProcesses.push(child);

      child.stdout?.on('data', (chunk) => {
        onData(chunk.toString());
      });
      child.stderr?.on('data', (chunk) => {
        onData(chunk.toString());
      });

      child.on('close', (code) => {
        this.childProcesses = this.childProcesses.filter((p) => p !== child);
        resolve(code ?? 0);
      });

      child.on('error', (err) => {
        this.childProcesses = this.childProcesses.filter((p) => p !== child);
        reject(err);
      });
    });
  }

  // --- File Watcher ---

  startWatcher(): void {
    if (this.watcher || !this.projectPath) return;
    console.log(`[Native] Starting file watcher on ${this.projectPath}`);

    this.watcher = watch(this.projectPath, {
      ignoreInitial: true,
      ignored: [
        '**/node_modules/**',
        '**/.angular/**',
        '**/.nx/**',
        '**/dist/**',
        '**/.git/**',
        '**/.cache/**',
        '**/tmp/**',
      ],
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('error', (err: Error) => {
      console.warn('[Native] File watcher error (non-fatal):', err.message);
    });

    const handleChange = (type: 'changed' | 'deleted', filePath: string) => {
      const relative = path.relative(this.projectPath!, filePath);
      if (this.recentWrites.has(relative)) return;

      const existing = this.debounceTimers.get(relative);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(
        relative,
        setTimeout(async () => {
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
        }, 300),
      );
    };

    this.watcher.on('add', (fp: string) => handleChange('changed', fp));
    this.watcher.on('change', (fp: string) => handleChange('changed', fp));
    this.watcher.on('unlink', (fp: string) => handleChange('deleted', fp));
  }

  stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.debounceTimers.forEach((t) => clearTimeout(t));
      this.debounceTimers.clear();
      console.log(`[Native] Stopped file watcher`);
    }
  }

  // --- Lifecycle ---

  async stop(): Promise<void> {
    this.stopWatcher();
    // Kill all child processes
    for (const child of this.childProcesses) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Already dead
      }
    }
    this.childProcesses = [];
    this.projectPath = null;
  }
}
