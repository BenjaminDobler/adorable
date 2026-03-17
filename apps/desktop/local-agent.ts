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
import * as http from 'http';

// --- NativeManager (self-contained) ---

class NativeManager {
  private projectPath: string | null = null;
  private childProcesses: ChildProcess[] = [];
  public readonly events = new EventEmitter();
  private watcher: FSWatcher | null = null;
  private recentWrites = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopKillTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the current project is an external folder (not managed by Adorable) */
  public isExternalProject = false;

  private get baseDir(): string {
    return process.env['ADORABLE_PROJECTS_DIR'] || path.join(os.homedir(), 'adorable-projects');
  }

  async createProject(projectId: string, clean = true): Promise<string> {
    // Cancel any pending delayed SIGKILL from a previous stop() call
    // to prevent it from killing the new project's processes
    if (this.stopKillTimer) {
      clearTimeout(this.stopKillTimer);
      this.stopKillTimer = null;
    }

    // If switching projects, force-kill any remaining child processes
    if (this.childProcesses.length > 0) {
      for (const child of this.childProcesses) {
        if (!child.pid) continue;
        try { process.kill(-child.pid, 'SIGKILL'); } catch {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }
      }
      this.childProcesses = [];
    }
    this.stopWatcher();

    this.isExternalProject = false;
    this.projectPath = path.join(this.baseDir, projectId);
    await fs.mkdir(this.projectPath, { recursive: true });

    // Clean stale source files from previous runs, but preserve node_modules
    // and .angular cache to keep installs fast across project switches.
    // Skip cleaning when clean=false (e.g. mountProject — files are already on disk).
    if (clean) {
      const KEEP = new Set(['node_modules', '.angular', '.nx']);
      try {
        const entries = await fs.readdir(this.projectPath);
        await Promise.all(
          entries
            .filter(e => !KEEP.has(e))
            .map(e => fs.rm(path.join(this.projectPath!, e), { recursive: true, force: true }))
        );
      } catch { /* empty or inaccessible — fine, mount will populate it */ }
    }

    return this.projectPath;
  }

  /**
   * Point NativeManager at an external project directory (no copy, no clean).
   * Used for "Open Folder" to work on existing projects in-place.
   */
  async openExternalPath(externalPath: string): Promise<string> {
    // Cancel any pending delayed SIGKILL from a previous stop() call
    if (this.stopKillTimer) {
      clearTimeout(this.stopKillTimer);
      this.stopKillTimer = null;
    }

    // Kill any remaining child processes from a previous project
    if (this.childProcesses.length > 0) {
      for (const child of this.childProcesses) {
        if (!child.pid) continue;
        try { process.kill(-child.pid, 'SIGKILL'); } catch {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }
      }
      this.childProcesses = [];
    }
    this.stopWatcher();

    // Point directly at the external path — no copying or cleaning
    this.isExternalProject = true;
    this.projectPath = externalPath;
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
    // No env vars needed for external projects — ong flags are passed as CLI args
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

    // For external projects running ong: replace `npx @richapps/ong` with Adorable's
    // own ong binary and inject --inject-html-file for runtime script injection.
    // This ensures we use the correct ong version (npx may cache an old one).
    let finalCmd = cmd;
    if (this.isExternalProject && cmd.some(a => a.includes('@richapps/ong'))) {
      let ongBin: string;
      try {
        // resolve from Adorable's node_modules — works in both dev and packaged mode
        ongBin = require.resolve('@richapps/ong/bin/ong.js');
      } catch {
        ongBin = path.join(__dirname, '..', '..', '..', 'node_modules', '@richapps', 'ong', 'bin', 'ong.js');
      }
      const runtimeScriptsPath = path.join(__dirname, '..', '..', 'libs', 'shared-types', 'src', 'lib', 'runtime-scripts.js');

      // Replace npx + @richapps/ong with direct node + ong binary
      finalCmd = cmd.map(a => a === '@richapps/ong' ? ongBin : a);
      if (finalCmd[0] === 'npx') {
        finalCmd[0] = 'node';
      }

      // Insert --inject-html-file before the '--' separator
      const dashDashIdx = finalCmd.indexOf('--');
      if (dashDashIdx !== -1) {
        finalCmd = [...finalCmd.slice(0, dashDashIdx), '--inject-html-file', runtimeScriptsPath, ...finalCmd.slice(dashDashIdx)];
      } else {
        finalCmd = [...finalCmd, '--inject-html-file', runtimeScriptsPath];
      }
      console.log('[Agent] ong command:', finalCmd.join(' '));
    }

    return new Promise((resolve, reject) => {
      const child = spawn(finalCmd[0], finalCmd.slice(1), {
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

  async readdir(relativePath: string, withFileTypes = false): Promise<{ name: string; isDirectory: boolean }[]> {
    if (!this.projectPath) throw new Error('Project not initialized');
    const fullPath = path.resolve(this.projectPath, relativePath);
    if (!fullPath.startsWith(this.projectPath)) throw new Error('Path traversal not allowed');
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
  }

  async readFile(relativePath: string): Promise<string> {
    if (!this.projectPath) throw new Error('Project not initialized');
    const fullPath = path.resolve(this.projectPath, relativePath);
    if (!fullPath.startsWith(this.projectPath)) throw new Error('Path traversal not allowed');
    return fs.readFile(fullPath, 'utf-8');
  }

  async readBinaryFile(relativePath: string): Promise<Buffer> {
    if (!this.projectPath) throw new Error('Project not initialized');
    const fullPath = path.resolve(this.projectPath, relativePath);
    if (!fullPath.startsWith(this.projectPath)) throw new Error('Path traversal not allowed');
    return fs.readFile(fullPath);
  }

  async stop(): Promise<void> {
    this.stopWatcher();

    // Kill all tracked child processes via their process groups.
    // Use SIGTERM first to allow graceful shutdown, then SIGKILL.
    for (const child of this.childProcesses) {
      if (!child.pid) continue;
      try {
        // Kill the entire process group (npm → ng → esbuild)
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try { child.kill('SIGTERM'); } catch { /* already dead */ }
      }
    }

    // Give processes a moment to exit gracefully, then force kill survivors.
    // Store the timer so createProject() can cancel it if a new project starts
    // before the timer fires (prevents killing the new project's processes).
    this.stopKillTimer = setTimeout(() => {
      this.stopKillTimer = null;
      for (const child of this.childProcesses) {
        if (!child.pid) continue;
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already dead */ }
      }
      this.childProcesses = [];
    }, 1000);

    // Don't null projectPath here — createProject() will override it.
    // This prevents "Project not initialized" errors from racing exec calls.
  }
}

// --- Registry (single user for desktop) ---

const manager = new NativeManager();

// --- Express App ---

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '200mb' }));

const AGENT_PORT = parseInt(process.env['ADORABLE_AGENT_PORT'] || '3334', 10);

app.post('/api/native/start', async (req, res) => {
  console.log('[Agent] POST /start received');
  try {
    const { projectId, clean, externalPath } = req.body;
    let projectPath: string;
    if (externalPath) {
      console.log('[Agent] Opening external path:', externalPath);
      projectPath = await manager.openExternalPath(externalPath);
    } else {
      console.log('[Agent] Creating project:', projectId, 'clean:', clean !== false);
      projectPath = await manager.createProject(projectId || 'desktop', clean !== false);
    }
    console.log('[Agent] Project ready at:', projectPath);
    res.json({ projectPath });
  } catch (e: any) {
    console.error('[Agent] Start failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/open-external', async (req, res) => {
  try {
    const { path: externalPath } = req.body;
    if (!externalPath) return res.status(400).json({ error: 'path is required' });
    const projectPath = await manager.openExternalPath(externalPath);
    res.json({ projectPath });
  } catch (e: any) {
    console.error('[Agent] open-external failed:', e.message);
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
  console.log('[Agent] POST /stop received');
  try {
    await manager.stop();
    console.log('[Agent] Stop completed');
    res.json({ success: true });
  } catch (e: any) {
    console.warn('[Agent] Stop warning:', e.message);
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
    if (!res.writableEnded) res.end();
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
  console.log('[Agent] exec-stream:', cmd, args.join(' '), '| cwd:', manager.getProjectPath());
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Close response if client disconnects — critical for freeing the TCP
  // connection slot in Chromium's per-origin pool (limit: 6 for HTTP/1.1).
  // Without this, aborted SSE connections stay half-open and block new requests.
  let clientDisconnected = false;
  req.on('close', () => {
    console.log('[Agent] exec-stream client disconnected:', cmd);
    clientDisconnected = true;
    if (!res.writableEnded) res.end();
  });

  try {
    await manager.execStream([cmd, ...args], undefined, (chunk) => {
      if (!clientDisconnected && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ output: chunk })}\n\n`);
      }
    }, env);
    if (!clientDisconnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
    console.log('[Agent] exec-stream completed:', cmd);
  } catch (e: any) {
    if (!clientDisconnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
    console.log('[Agent] exec-stream error:', cmd, e.message);
  }
});

app.post('/api/native/readdir', async (req, res) => {
  try {
    const { path: dirPath, withFileTypes } = req.body;
    const entries = await manager.readdir(dirPath || '.', withFileTypes);
    res.json({ entries });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/read-file', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    const content = await manager.readFile(filePath);
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/read-binary-file', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    const content = await manager.readBinaryFile(filePath);
    res.json({ content: content.toString('base64') });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Preview Window Manager reference (set by main.ts) ---

let previewManagerRef: any = null;
let previewEventCallback: ((event: any) => void) | null = null;

export function setPreviewManager(mgr: any) {
  previewManagerRef = mgr;
}

export function setPreviewEventCallback(callback: (event: any) => void) {
  previewEventCallback = callback;
}

// --- Preview Shell Event Relay ---

/** Receives events from the preview shell (inspect, annotation, screenshot) and forwards to main window */
app.post('/api/native/preview-shell/event', (req, res) => {
  const event = req.body;
  if (previewEventCallback && event?.type) {
    previewEventCallback(event);
  }
  res.json({ success: true });
});

// --- CDP Bridge Routes ---

app.post('/api/native/cdp/screenshot', async (_req, res) => {
  if (!previewManagerRef?.isUndocked()) {
    return res.status(400).json({ error: 'Preview is not undocked. Undock the preview window to use CDP tools.' });
  }
  try {
    const image = await previewManagerRef.captureScreenshot();
    res.json({ image });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/cdp/evaluate', async (req, res) => {
  if (!previewManagerRef?.isUndocked()) {
    return res.status(400).json({ error: 'Preview is not undocked.' });
  }
  try {
    const result = await previewManagerRef.evaluate(req.body.expression);
    res.json({ result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/cdp/accessibility', async (_req, res) => {
  if (!previewManagerRef?.isUndocked()) {
    return res.status(400).json({ error: 'Preview is not undocked.' });
  }
  try {
    const tree = await previewManagerRef.getAccessibilityTree();
    res.json({ tree });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/cdp/console', async (req, res) => {
  if (!previewManagerRef?.isUndocked()) {
    return res.status(400).json({ error: 'Preview is not undocked.' });
  }
  try {
    const messages = previewManagerRef.getConsoleMessages(req.body.clear !== false);
    res.json({ messages });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/cdp/navigate', async (req, res) => {
  if (!previewManagerRef?.isUndocked()) {
    return res.status(400).json({ error: 'Preview is not undocked.' });
  }
  try {
    await previewManagerRef.navigateCDP(req.body.url);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/native/cdp/click', async (req, res) => {
  if (!previewManagerRef?.isUndocked()) {
    return res.status(400).json({ error: 'Preview is not undocked.' });
  }
  try {
    await previewManagerRef.click(req.body.x, req.body.y);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/native/cdp/status', (_req, res) => {
  res.json({
    available: !!previewManagerRef?.isUndocked(),
  });
});

/**
 * Serves the preview wrapper HTML page with an embedded toolbar.
 * The preview window loads this instead of the raw dev server URL.
 * Query param: ?url=<dev-server-url>
 */
app.get('/api/native/preview-shell', (req, res) => {
  const previewUrl = req.query.url as string || 'about:blank';
  res.setHeader('Content-Type', 'text/html');
  res.send(getPreviewShellHTML(previewUrl));
});

/** Dock back — triggered from preview shell toolbar */
app.post('/api/native/preview-shell/dock', async (_req, res) => {
  if (previewManagerRef) {
    await previewManagerRef.dock();
  }
  res.json({ success: true });
});

/** Open external URL — triggered from preview shell toolbar */
app.post('/api/native/preview-shell/open-external', async (req, res) => {
  const url = req.body.url;
  if (url && /^https?:\/\//i.test(url) && openExternalHandler) {
    openExternalHandler(url);
  }
  res.json({ success: true });
});

let openExternalHandler: ((url: string) => void) | null = null;

export function setOpenExternalHandler(handler: (url: string) => void) {
  openExternalHandler = handler;
}

function getPreviewShellHTML(previewUrl: string): string {
  // The preview shell is a self-contained HTML page with toolbar, iframe, and overlay tools.
  // It communicates with the main window via HTTP POSTs to the local agent event relay.
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Adorable Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    /* Matches the main app's dark theme (styles.scss :root) */
    --bg-color: #030304;
    --bg-surface-2: #111114;
    --bg-surface-3: #1a1a1f;
    --panel-border: rgba(255, 255, 255, 0.06);
    --panel-border-hover: rgba(255, 255, 255, 0.12);
    --text-primary: #f0f0f2;
    --text-secondary: #8a8a95;
    --text-muted: #55555f;
    --accent-color: #34d399;
    --accent-glow: rgba(52, 211, 153, 0.35);
    --radius-sm: 6px;
  }
  html, body { height: 100%; overflow: hidden; background: var(--bg-color); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .shell { display: flex; flex-direction: column; height: 100vh; }

  .toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    background: var(--bg-surface-2);
    border-bottom: 1px solid var(--panel-border);
    -webkit-app-region: drag;
    flex-shrink: 0;
  }
  .toolbar button, .toolbar .device-buttons, .toolbar .url-display { -webkit-app-region: no-drag; }

  .device-buttons { display: flex; gap: 4px; margin-right: auto; }

  .toolbar button {
    background: var(--bg-surface-3);
    border: 1px solid var(--panel-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    display: flex; align-items: center; justify-content: center;
  }
  .toolbar button:hover { color: var(--text-primary); border-color: var(--text-muted); }
  .toolbar button.active { background: var(--accent-glow) !important; border-color: var(--accent-color) !important; color: var(--accent-color) !important; }

  .separator { width: 1px; height: 20px; background: var(--panel-border); margin: 0 4px; }

  .url-display {
    font-size: 11px; color: var(--text-muted);
    background: rgba(0,0,0,0.3);
    padding: 3px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--panel-border);
    max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .preview-area { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; }

  .preview-container {
    flex: 1; display: flex; justify-content: center; align-items: stretch;
    overflow: hidden; background: var(--bg-color);
    padding: 0; transition: padding 0.3s ease;
  }
  .preview-container.device-tablet,
  .preview-container.device-phone {
    padding: 16px; align-items: center;
    background: linear-gradient(135deg, #050506 0%, #0a0a0e 100%);
  }

  iframe {
    border: none; width: 100%; height: 100%;
    transition: width 0.3s ease, max-width 0.3s ease, box-shadow 0.3s ease, border-radius 0.3s ease;
  }
  .device-tablet iframe { max-width: 768px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
  .device-phone iframe { max-width: 375px; border-radius: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }

  /* Annotation overlay */
  #annotation-overlay {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    display: none; z-index: 100; cursor: crosshair;
  }
  #annotation-overlay.active { display: block; }
  #annotation-canvas { width: 100%; height: 100%; }

  .annotation-toolbar {
    position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; padding: 8px 12px;
    background: var(--bg-surface-2); border: 1px solid var(--panel-border); border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6); z-index: 101;
  }
  .annotation-toolbar button {
    background: var(--bg-surface-3); border: 1px solid var(--panel-border); border-radius: var(--radius-sm);
    padding: 6px 10px; color: var(--text-secondary); cursor: pointer; font-size: 12px;
    transition: all 0.2s;
  }
  .annotation-toolbar button:hover { color: var(--text-primary); border-color: var(--text-muted); }
  .annotation-toolbar button.active { background: var(--accent-glow) !important; border-color: var(--accent-color) !important; color: var(--accent-color) !important; }
  .color-dot {
    width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--panel-border); cursor: pointer;
    transition: border-color 0.15s;
  }
  .color-dot:hover { border-color: var(--text-muted); }
  .color-dot.active { border-color: var(--text-primary); box-shadow: 0 0 0 2px var(--accent-color); }

  /* Screenshot selection overlay */
  #screenshot-overlay {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    display: none; z-index: 100; cursor: crosshair;
  }
  #screenshot-overlay.active { display: block; }
  .selection-box {
    position: absolute; border: 2px dashed var(--accent-color);
    background: rgba(52, 211, 153, 0.08);
  }
</style>
</head>
<body>
<div class="shell">
  <div class="toolbar">
    <div class="device-buttons">
      <button id="btn-phone" title="Phone (375px)" onclick="setDevice('phone')">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
      </button>
      <button id="btn-tablet" title="Tablet (768px)" onclick="setDevice('tablet')">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
      </button>
      <button id="btn-desktop" class="active" title="Desktop (100%)" onclick="setDevice('desktop')">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      </button>
    </div>

    <span class="url-display" id="url-display" title="${previewUrl}">${previewUrl.replace(new RegExp('^https?://'), '')}</span>

    <div class="separator"></div>

    <!-- Inspect -->
    <button id="btn-inspect" title="Inspect Element" onclick="toggleInspect()">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M5 2H2v3"/><path d="M19 2h3v3"/><path d="M2 19v3h3"/><path d="M22 19v3h-3"/><path d="M7 7l5.5 13 2-5 5-2L7 7z" fill="currentColor" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <!-- Screenshot selection -->
    <button id="btn-screenshot" title="Screenshot Selection" onclick="startScreenshotSelection()">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M2 7V2h5"/><path d="M17 2h5v5"/><path d="M22 17v5h-5"/><path d="M7 22H2v-5"/><rect x="6" y="9" width="12" height="9" rx="1"/><path d="M9 9l1-2h4l1 2"/><circle cx="12" cy="13.5" r="2.5"/></svg>
    </button>
    <!-- Annotate -->
    <button id="btn-annotate" title="Annotate Preview" onclick="toggleAnnotate()">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    </button>
    <!-- Refresh -->
    <button title="Refresh Preview" onclick="refreshPreview()">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    </button>
    <!-- Open in browser -->
    <button title="Open in Browser" onclick="openExternal()">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    </button>

    <div class="separator"></div>

    <!-- Dock back -->
    <button title="Dock Preview Back" onclick="dockBack()">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="14" height="14" rx="2"/><path d="M22 2v8h-8"/><path d="M22 2l-7 7"/>
      </svg>
    </button>
  </div>

  <div class="preview-area">
    <div class="preview-container" id="preview-container">
      <iframe id="preview-iframe" src="${previewUrl}"></iframe>
    </div>

    <!-- Annotation overlay (drawn on top of preview) -->
    <div id="annotation-overlay">
      <canvas id="annotation-canvas"></canvas>
      <div class="annotation-toolbar" id="annotation-toolbar">
        <button class="active" data-tool="pen" onclick="setAnnotationTool('pen')">Pen</button>
        <button data-tool="arrow" onclick="setAnnotationTool('arrow')">Arrow</button>
        <button data-tool="rect" onclick="setAnnotationTool('rect')">Rect</button>
        <div class="separator"></div>
        <div class="color-dot active" style="background:#ef4444" onclick="setAnnotationColor('#ef4444',this)"></div>
        <div class="color-dot" style="background:#eab308" onclick="setAnnotationColor('#eab308',this)"></div>
        <div class="color-dot" style="background:#3b82f6" onclick="setAnnotationColor('#3b82f6',this)"></div>
        <div class="color-dot" style="background:#22c55e" onclick="setAnnotationColor('#22c55e',this)"></div>
        <div class="color-dot" style="background:#ffffff" onclick="setAnnotationColor('#ffffff',this)"></div>
        <div class="separator"></div>
        <button onclick="clearAnnotation()">Clear</button>
        <button onclick="cancelAnnotation()">Cancel</button>
        <button onclick="finishAnnotation()" style="background:var(--accent-color);color:#030304;border-color:var(--accent-color);font-weight:500">Done</button>
      </div>
    </div>

    <!-- Screenshot selection overlay -->
    <div id="screenshot-overlay"></div>
  </div>
</div>

<script>
  const iframe = document.getElementById('preview-iframe');
  const container = document.getElementById('preview-container');
  let currentDevice = 'desktop';
  let inspectActive = false;

  // --- Event relay helper ---
  function relayEvent(data) {
    fetch('/api/native/preview-shell/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(() => {});
  }

  // --- Device switching ---
  function setDevice(device) {
    currentDevice = device;
    container.className = 'preview-container device-' + device;
    document.querySelectorAll('.device-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + device)?.classList.add('active');
  }

  function refreshPreview() { iframe.src = iframe.src; }

  function openExternal() {
    fetch('/api/native/preview-shell/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: iframe.src || '${previewUrl}' })
    }).catch(() => {});
  }

  function dockBack() {
    fetch('/api/native/preview-shell/dock', { method: 'POST' }).catch(() => {});
  }

  // --- Navigation ---
  function navigatePreview(url) {
    iframe.src = url;
    const display = document.getElementById('url-display');
    display.textContent = url.replace(new RegExp('^https?://'), '');
    display.title = url;
  }

  // --- Inspect Element ---
  function toggleInspect() {
    inspectActive = !inspectActive;
    document.getElementById('btn-inspect').classList.toggle('active', inspectActive);
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'TOGGLE_INSPECTOR', enabled: inspectActive }, '*');
    }
  }

  // Listen for iframe messages (ELEMENT_SELECTED, INLINE_TEXT_EDIT, PREVIEW_CONSOLE)
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'ELEMENT_SELECTED') {
      relayEvent({ type: 'element-selected', payload: event.data.payload });
    }
    if (event.data?.type === 'INLINE_TEXT_EDIT') {
      relayEvent({ type: 'inline-text-edit', payload: event.data.payload });
    }
    if (event.data?.type === 'PREVIEW_CONSOLE') {
      relayEvent({ type: 'preview-console', level: event.data.level, message: event.data.message });
    }
  });

  // --- Screenshot Selection ---
  let screenshotMode = false;
  let ssStart = null;
  const ssOverlay = document.getElementById('screenshot-overlay');

  function startScreenshotSelection() {
    screenshotMode = true;
    ssOverlay.classList.add('active');
    iframe.style.pointerEvents = 'none';
  }

  ssOverlay.addEventListener('mousedown', (e) => {
    ssStart = { x: e.clientX, y: e.clientY };
    const box = document.createElement('div');
    box.className = 'selection-box';
    box.id = 'ss-box';
    ssOverlay.appendChild(box);
  });

  ssOverlay.addEventListener('mousemove', (e) => {
    if (!ssStart) return;
    const box = document.getElementById('ss-box');
    if (!box) return;
    const x = Math.min(e.clientX, ssStart.x);
    const y = Math.min(e.clientY, ssStart.y);
    const w = Math.abs(e.clientX - ssStart.x);
    const h = Math.abs(e.clientY - ssStart.y);
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';
  });

  ssOverlay.addEventListener('mouseup', async (e) => {
    if (!ssStart) return;
    const w = Math.abs(e.clientX - ssStart.x);
    const h = Math.abs(e.clientY - ssStart.y);
    ssStart = null;
    const box = document.getElementById('ss-box');
    if (box) box.remove();
    ssOverlay.classList.remove('active');
    iframe.style.pointerEvents = '';
    screenshotMode = false;

    if (w < 10 || h < 10) return;

    // Capture full screenshot via CDP, then crop client-side
    try {
      const resp = await fetch('/api/native/cdp/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await resp.json();
      if (data.image) {
        relayEvent({ type: 'screenshot-captured', image: 'data:image/png;base64,' + data.image });
      }
    } catch {}
  });

  // --- Annotation ---
  let annotationActive = false;
  let annotationTool = 'pen';
  let annotationColor = '#ef4444';
  let annotationStrokes = [];
  let currentStroke = null;
  let annotationCtx = null;

  const annOverlay = document.getElementById('annotation-overlay');
  const annCanvas = document.getElementById('annotation-canvas');

  function setupAnnotationCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = annOverlay.getBoundingClientRect();
    annCanvas.width = rect.width * dpr;
    annCanvas.height = rect.height * dpr;
    annotationCtx = annCanvas.getContext('2d');
    annotationCtx.scale(dpr, dpr);
    redrawAnnotation();
  }

  function toggleAnnotate() {
    annotationActive = !annotationActive;
    document.getElementById('btn-annotate').classList.toggle('active', annotationActive);
    annOverlay.classList.toggle('active', annotationActive);
    iframe.style.pointerEvents = annotationActive ? 'none' : '';
    if (annotationActive) {
      // Disable inspector when annotating
      if (inspectActive) toggleInspect();
      annotationStrokes = [];
      setupAnnotationCanvas();
    }
  }

  function setAnnotationTool(tool) {
    annotationTool = tool;
    document.querySelectorAll('#annotation-toolbar button[data-tool]').forEach(b => b.classList.remove('active'));
    document.querySelector('#annotation-toolbar button[data-tool="' + tool + '"]')?.classList.add('active');
  }

  function setAnnotationColor(color, el) {
    annotationColor = color;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    el.classList.add('active');
  }

  function clearAnnotation() {
    annotationStrokes = [];
    redrawAnnotation();
  }

  function cancelAnnotation() {
    annotationActive = false;
    annOverlay.classList.remove('active');
    document.getElementById('btn-annotate').classList.remove('active');
    iframe.style.pointerEvents = '';
    annotationStrokes = [];
  }

  async function finishAnnotation() {
    // Get the annotation drawing as transparent PNG
    const drawingDataUrl = annCanvas.toDataURL('image/png');
    const annotations = {
      texts: [],
      hasArrows: annotationStrokes.some(s => s.type === 'arrow'),
      hasRectangles: annotationStrokes.some(s => s.type === 'rect'),
      hasFreehand: annotationStrokes.some(s => s.type === 'pen'),
    };

    // Capture the preview screenshot via CDP
    let screenshotDataUrl = null;
    try {
      const resp = await fetch('/api/native/cdp/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await resp.json();
      if (data.image) screenshotDataUrl = 'data:image/png;base64,' + data.image;
    } catch {}

    // Composite screenshot + annotation
    if (screenshotDataUrl) {
      const composited = await compositeImages(screenshotDataUrl, drawingDataUrl);
      relayEvent({ type: 'annotation-done', image: composited, annotations });
    } else {
      relayEvent({ type: 'annotation-done', image: drawingDataUrl, annotations });
    }

    cancelAnnotation();
  }

  function compositeImages(base, overlay) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const baseImg = new Image();
      baseImg.onload = () => {
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        ctx.drawImage(baseImg, 0, 0);
        const overlayImg = new Image();
        overlayImg.onload = () => {
          ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        overlayImg.src = overlay;
      };
      baseImg.src = base;
    });
  }

  // --- Annotation drawing ---
  annCanvas.addEventListener('mousedown', (e) => {
    if (!annotationActive) return;
    const rect = annCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (annotationTool === 'pen') {
      currentStroke = { type: 'pen', color: annotationColor, width: 3, points: [{ x, y }] };
    } else if (annotationTool === 'arrow' || annotationTool === 'rect') {
      currentStroke = { type: annotationTool, color: annotationColor, width: 3, start: { x, y }, end: { x, y } };
    }
  });

  annCanvas.addEventListener('mousemove', (e) => {
    if (!currentStroke) return;
    const rect = annCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (currentStroke.type === 'pen') {
      currentStroke.points.push({ x, y });
    } else {
      currentStroke.end = { x, y };
    }
    redrawAnnotation();
  });

  annCanvas.addEventListener('mouseup', () => {
    if (currentStroke) {
      annotationStrokes.push(currentStroke);
      currentStroke = null;
      redrawAnnotation();
    }
  });

  function redrawAnnotation() {
    if (!annotationCtx) return;
    const rect = annOverlay.getBoundingClientRect();
    annotationCtx.clearRect(0, 0, rect.width, rect.height);
    const allStrokes = [...annotationStrokes];
    if (currentStroke) allStrokes.push(currentStroke);
    for (const s of allStrokes) {
      annotationCtx.strokeStyle = s.color;
      annotationCtx.lineWidth = s.width;
      annotationCtx.lineCap = 'round';
      annotationCtx.lineJoin = 'round';
      if (s.type === 'pen' && s.points.length > 1) {
        annotationCtx.beginPath();
        annotationCtx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) annotationCtx.lineTo(s.points[i].x, s.points[i].y);
        annotationCtx.stroke();
      } else if (s.type === 'rect') {
        annotationCtx.strokeRect(s.start.x, s.start.y, s.end.x - s.start.x, s.end.y - s.start.y);
      } else if (s.type === 'arrow') {
        drawArrow(annotationCtx, s.start.x, s.start.y, s.end.x, s.end.y, s.color, s.width);
      }
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, width) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 14;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // --- Handle commands from main window (via Electron IPC -> executeJavaScript) ---
  function handleShellCommand(cmd) {
    if (cmd.type === 'toggle-inspect') toggleInspect();
    if (cmd.type === 'toggle-annotate') toggleAnnotate();
    if (cmd.type === 'start-screenshot') startScreenshotSelection();
    if (cmd.type === 'clear-selection') {
      if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'CLEAR_SELECTION' }, '*');
    }
    if (cmd.type === 'select-element') {
      if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'SELECT_ELEMENT', ...cmd.data }, '*');
    }
  }

  // Resize annotation canvas when window resizes
  window.addEventListener('resize', () => { if (annotationActive) setupAnnotationCanvas(); });
</script>
</body>
</html>`;
}

// --- Also serve the Angular client ---

import * as pathModule from 'path';

// --- Injecting Proxy for External Projects ---
// Proxies the dev server and injects RUNTIME_SCRIPTS into HTML responses.
// This lets visual editing tools (inspector, annotations, console relay) work
// on external projects without modifying their source files.

// Use the full runtime scripts (inspector, console relay, element selection, screenshots)
// so external projects get full visual editing capabilities through the proxy.
// Loaded at runtime from the compiled shared-types output (built by `nx build server`).
let RUNTIME_SCRIPTS_INJECTION = '';
try {
  const runtimeScriptsPath = path.join(__dirname, '..', '..', 'libs', 'shared-types', 'src', 'lib', 'runtime-scripts');
  const { RUNTIME_SCRIPTS } = require(runtimeScriptsPath);
  RUNTIME_SCRIPTS_INJECTION = `<!-- ADORABLE_RUNTIME_SCRIPTS -->\n${RUNTIME_SCRIPTS}\n<!-- /ADORABLE_RUNTIME_SCRIPTS -->`;
} catch {
  console.warn('[Agent] Could not load runtime scripts for preview proxy injection');
}

// --- Injecting Preview Proxy (dedicated port) ---
// Runs on its own port so relative paths in the app just work (no path prefix needed).
// Forwards all requests to the dev server, injecting RUNTIME_SCRIPTS into HTML responses.

let proxyTarget: { hostname: string; port: string } | null = null;
let proxyServer: http.Server | null = null;
let proxyPort: number | null = null;

function startPreviewProxy(target: { hostname: string; port: string }): Promise<number> {
  // Reuse existing server if target didn't change
  if (proxyServer && proxyTarget?.hostname === target.hostname && proxyTarget?.port === target.port && proxyPort) {
    return Promise.resolve(proxyPort);
  }

  // Close previous proxy server
  if (proxyServer) {
    proxyServer.close();
    proxyServer = null;
    proxyPort = null;
  }

  proxyTarget = target;

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const proxyOpts: http.RequestOptions = {
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `${target.hostname}:${target.port}` },
      };

      const proxyReq = http.request(proxyOpts, (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';
        const isHtml = contentType.includes('text/html');

        if (!isHtml) {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
          return;
        }

        // HTML: buffer, inject runtime scripts, send
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf-8');

          if (body.includes('</head>')) {
            body = body.replace('</head>', `${RUNTIME_SCRIPTS_INJECTION}\n</head>`);
          }

          const headers = { ...proxyRes.headers };
          delete headers['content-length'];
          delete headers['content-encoding'];
          res.writeHead(proxyRes.statusCode || 200, headers);
          res.end(body);
        });
      });

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Proxy error: ${err.message}`);
        }
      });

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        req.pipe(proxyReq);
      } else {
        proxyReq.end();
      }
    });

    // Forward WebSocket upgrades (HMR)
    server.on('upgrade', (req: http.IncomingMessage, socket: any, head: Buffer) => {
      const wsReq = http.request({
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: 'GET',
        headers: { ...req.headers, host: `${target.hostname}:${target.port}` },
      });

      wsReq.on('upgrade', (_proxyRes, proxySocket, proxyHead) => {
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\n` +
          Object.entries(_proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
          '\r\n\r\n'
        );
        if (proxyHead.length) socket.write(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        proxySocket.on('error', () => socket.destroy());
        socket.on('error', () => proxySocket.destroy());
      });

      wsReq.on('error', () => socket.destroy());
      wsReq.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      proxyServer = server;
      proxyPort = port;
      console.log(`[Agent] Injecting preview proxy on http://localhost:${port} → ${target.hostname}:${target.port}`);
      resolve(port);
    });
  });
}

app.post('/api/native/preview-proxy-target', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    if (proxyServer) { proxyServer.close(); proxyServer = null; proxyPort = null; proxyTarget = null; }
    return res.json({ success: true, port: null });
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return res.status(403).json({ error: 'Only localhost targets allowed' });
    }
    const port = await startPreviewProxy({ hostname: parsed.hostname, port: parsed.port || '80' });
    res.json({ success: true, port });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export function startLocalAgent(clientPath?: string): Promise<number> {
  // Serve the built Angular client if path provided
  if (clientPath) {
    app.use(expressStatic(clientPath));

    // SPA catch-all for Angular routing (skip static file requests)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      if (pathModule.extname(req.path)) return next();
      res.sendFile(pathModule.join(clientPath, 'index.html'));
    });
  }

  return new Promise((resolve) => {
    const server = app.listen(AGENT_PORT, () => {
      console.log(`[Local Agent] Listening on http://localhost:${AGENT_PORT}`);
      resolve(AGENT_PORT);
    });

  });
}

// Re-export express.static since we import express at top
const expressStatic = express.static;
