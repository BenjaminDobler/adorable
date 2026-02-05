/**
 * Local Agent — Lightweight Express server for native file/process operations.
 * Runs on localhost:3334, no auth (local-only).
 * The desktop Electron app starts this alongside connecting to the cloud server.
 */
import express from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'chokidar';
import * as os from 'os';

// --- NativeManager (self-contained) ---

class NativeManager {
  private projectPath: string | null = null;
  private childProcesses: ChildProcess[] = [];
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

  async getProjectInfo() {
    if (!this.projectPath) return null;
    return { projectPath: this.projectPath, status: 'running' };
  }

  async copyFiles(files: Record<string, any>): Promise<void> {
    if (!this.projectPath) throw new Error('Project not initialized');
    this.trackRecentWrites(files);

    // Collect all file operations first, then execute in parallel batches
    const operations: Array<{ path: string; content: Buffer | string; encoding?: string }> = [];
    this.collectFileOps(files, this.projectPath, operations);

    // Write files in parallel batches to avoid blocking event loop
    const BATCH_SIZE = 20;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (op) => {
        await fs.mkdir(path.dirname(op.path), { recursive: true });
        await fs.writeFile(op.path, op.content);
      }));
      // Yield to event loop between batches
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  private collectFileOps(
    tree: Record<string, any>,
    basePath: string,
    operations: Array<{ path: string; content: Buffer | string }>
  ): void {
    for (const key in tree) {
      if (key === '.DS_Store') continue; // Skip macOS metadata files
      const node = tree[key];
      const fullPath = path.join(basePath, key);
      if (node.file) {
        const content = node.file.encoding === 'base64'
          ? Buffer.from(node.file.contents, 'base64')
          : node.file.contents;
        operations.push({ path: fullPath, content });
      } else if (node.directory) {
        this.collectFileOps(node.directory, fullPath, operations);
      }
    }
  }

  private trackRecentWrites(files: Record<string, any>, prefix = '') {
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

  async exec(cmd: string[], workDir?: string, env?: Record<string, string>): Promise<{ output: string; exitCode: number }> {
    if (!this.projectPath) throw new Error('Project not initialized');
    const cwd = workDir || this.projectPath;
    const mergedEnv = { ...process.env, ...env };
    return new Promise((resolve, reject) => {
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd,
        env: mergedEnv,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true  // Create process group for clean termination
      });
      this.childProcesses.push(child);
      let output = '';
      child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
      child.stderr?.on('data', (chunk) => { output += chunk.toString(); });
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

  async execStream(cmd: string[], workDir: string | undefined, onData: (chunk: string) => void, env?: Record<string, string>): Promise<number> {
    if (!this.projectPath) throw new Error('Project not initialized');
    const cwd = workDir || this.projectPath;
    const mergedEnv = { ...process.env, ...env };
    return new Promise((resolve, reject) => {
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd,
        env: mergedEnv,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true  // Create process group for clean termination
      });
      this.childProcesses.push(child);
      child.stdout?.on('data', (chunk) => { onData(chunk.toString()); });
      child.stderr?.on('data', (chunk) => { onData(chunk.toString()); });
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

  startWatcher(): void {
    if (this.watcher || !this.projectPath) return;
    this.watcher = watch(this.projectPath, {
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.angular/**', '**/.nx/**', '**/dist/**', '**/.git/**', '**/.cache/**', '**/tmp/**', '**/.DS_Store'],
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    this.watcher.on('error', (err: Error) => console.warn('[Agent] Watcher error:', err.message));
    const handleChange = (type: 'changed' | 'deleted', filePath: string) => {
      const relative = path.relative(this.projectPath!, filePath);
      if (this.recentWrites.has(relative)) return;
      const existing = this.debounceTimers.get(relative);
      if (existing) clearTimeout(existing);
      this.debounceTimers.set(relative, setTimeout(async () => {
        this.debounceTimers.delete(relative);
        if (type === 'changed') {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            this.events.emit('file-changed', { path: relative, content });
          } catch { /* deleted between detect and read */ }
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
      this.debounceTimers.forEach((t) => clearTimeout(t));
      this.debounceTimers.clear();
    }
  }

  async stop(): Promise<void> {
    this.stopWatcher();

    // Kill all tracked child processes - fire and forget, don't wait
    for (const child of this.childProcesses) {
      if (!child.pid) continue;

      try {
        // Try to kill the process group first
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch { /* already dead */ }
      }
    }

    // Clear immediately - don't wait for processes to actually exit
    this.childProcesses = [];
    this.projectPath = null;
  }
}

// --- Registry (single user for desktop) ---

const manager = new NativeManager();

// --- Express App ---

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

const AGENT_PORT = parseInt(process.env['ADORABLE_AGENT_PORT'] || '3334', 10);

app.post('/api/native/start', async (_req, res) => {
  try {
    // Desktop = single user, use a fixed userId
    const projectPath = await manager.createProject('desktop');
    res.json({ projectPath });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/native/info', async (_req, res) => {
  try {
    if (!manager.isRunning()) return res.status(404).json({ error: 'No project running' });
    const info = await manager.getProjectInfo();
    res.json(info);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/stop', async (_req, res) => {
  try {
    await manager.stop();
    res.json({ success: true });
  } catch (e: any) {
    // Always return success for stop - even if already stopped
    console.warn('[Local Agent] Stop warning:', e.message);
    res.json({ success: true, warning: e.message });
  }
});

app.get('/api/native/watch', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (!manager.isRunning()) {
    res.write(`data: ${JSON.stringify({ error: 'No project running' })}\n\n`);
    res.end();
    return;
  }
  manager.startWatcher();
  const onChanged = (data: { path: string; content: string }) => {
    res.write(`data: ${JSON.stringify({ type: 'changed', path: data.path, content: data.content })}\n\n`);
  };
  const onDeleted = (data: { path: string }) => {
    res.write(`data: ${JSON.stringify({ type: 'deleted', path: data.path })}\n\n`);
  };
  manager.events.on('file-changed', onChanged);
  manager.events.on('file-deleted', onDeleted);
  const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 30000);
  _req.on('close', () => {
    clearInterval(heartbeat);
    manager.events.off('file-changed', onChanged);
    manager.events.off('file-deleted', onDeleted);
  });
});

app.post('/api/native/mount', async (req, res) => {
  try {
    await manager.copyFiles(req.body.files);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/exec', async (req, res) => {
  const { cmd, args, workDir, env } = req.body;
  try {
    const result = await manager.exec([cmd, ...(args || [])], workDir, env);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/native/exec-stream', async (req, res) => {
  const cmd = req.query.cmd as string;
  const args = req.query.args ? (req.query.args as string).split(',') : [];
  const env = req.query.env ? JSON.parse(req.query.env as string) : undefined;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    await manager.execStream([cmd, ...args], undefined, (chunk) => {
      res.write(`data: ${JSON.stringify({ output: chunk })}\n\n`);
    }, env);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// --- Also serve the Angular client ---

import * as pathModule from 'path';

export function startLocalAgent(clientPath?: string): Promise<number> {
  // Serve the built Angular client if path provided
  if (clientPath) {
    app.use(expressStatic(clientPath));

    // SPA catch-all for Angular routing
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(pathModule.join(clientPath, 'index.html'));
    });
  }

  return new Promise((resolve) => {
    app.listen(AGENT_PORT, () => {
      console.log(`[Local Agent] Listening on http://localhost:${AGENT_PORT}`);
      resolve(AGENT_PORT);
    });
  });
}

// Re-export express.static since we import express at top
const expressStatic = express.static;
