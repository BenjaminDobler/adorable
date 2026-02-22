import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { fork, ChildProcess } from 'child_process';
import * as jwt from 'jsonwebtoken';
import { ensureNode } from './node-bootstrap';
import { startLocalAgent } from './local-agent';
import { getOrCreateJwtSecret } from './jwt-secret';
import { initializeDatabase } from './db-init';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let localUserToken: string | null = null;

// Server and agent ports
const SERVER_PORT = parseInt(process.env['ADORABLE_SERVER_PORT'] || '3333', 10);
const AGENT_PORT = parseInt(process.env['ADORABLE_AGENT_PORT'] || '3334', 10);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Adorable',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the Angular client from the local agent (bundled with the app)
  mainWindow.loadURL(`http://localhost:${AGENT_PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Starts the embedded backend server as a child process.
 * The server handles API routes, authentication, and database operations.
 */
async function startEmbeddedServer(): Promise<number> {
  const userDataPath = app.getPath('userData');

  // Determine server path and directory based on packaged vs dev mode
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '..', 'server');
  const serverPath = path.join(serverDir, 'main.js');

  // Get or create persistent JWT secret
  const jwtSecret = await getOrCreateJwtSecret(userDataPath);

  // Set up data directories in userData
  const sitesDir = path.join(userDataPath, 'published-sites');
  const storageDir = path.join(userDataPath, 'storage');

  console.log(`[Desktop] Starting embedded server from: ${serverPath}`);
  console.log(`[Desktop] Server working directory: ${serverDir}`);
  console.log(`[Desktop] Server data directory: ${userDataPath}`);

  serverProcess = fork(serverPath, [], {
    cwd: serverDir, // Set working directory so node_modules can be found
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      DATABASE_URL: process.env['DATABASE_URL'], // Set by initializeDatabase
      JWT_SECRET: jwtSecret,
      SITES_DIR: sitesDir,
      STORAGE_DIR: storageDir,
      ADORABLE_DESKTOP_MODE: 'true'
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  // Forward server stdout/stderr to console
  serverProcess.stdout?.on('data', (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (error) => {
    console.error('[Desktop] Server process error:', error);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`[Desktop] Server process exited with code ${code}, signal ${signal}`);
    serverProcess = null;
  });

  // Wait for server to signal it's ready
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout - server did not signal ready within 30 seconds'));
    }, 30000);

    serverProcess!.on('message', (msg: any) => {
      if (msg.type === 'ready') {
        clearTimeout(timeout);
        console.log(`[Desktop] Embedded server ready on port ${msg.port}`);
        resolve(msg.port);
      }
    });

    serverProcess!.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    serverProcess!.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });
}

/**
 * Gracefully shuts down the server process.
 */
function stopEmbeddedServer(): void {
  if (serverProcess) {
    console.log('[Desktop] Stopping embedded server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

app.on('ready', async () => {
  try {
    await ensureNode();

    // Initialize database (creates/migrates SQLite in userData)
    console.log('[Desktop] Initializing database...');
    const { localUser } = await initializeDatabase();

    // Get JWT secret and generate token for local user
    const userDataPath = app.getPath('userData');
    const jwtSecret = await getOrCreateJwtSecret(userDataPath);

    // Generate long-lived token for local user (1 year expiry)
    localUserToken = jwt.sign(
      { userId: localUser.id },
      jwtSecret,
      { expiresIn: '365d' }
    );
    console.log('[Desktop] Generated auto-login token for local user');

    // Register IPC handler for client to request the token
    ipcMain.handle('get-local-user-token', () => {
      return localUserToken;
    });

    // Register IPC handler for fast screenshot capture
    ipcMain.handle('capture-page', async (_event, rect?: { x: number; y: number; width: number; height: number }) => {
      if (!mainWindow) return null;
      try {
        const nativeRect = rect
          ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
          : undefined;
        const image = await mainWindow.webContents.capturePage(nativeRect);
        return image.toDataURL();
      } catch (err) {
        console.error('[Desktop] capture-page failed:', err);
        return null;
      }
    });

    // Start the embedded backend server
    console.log('[Desktop] Starting embedded server...');
    await startEmbeddedServer();

    // Path to the built Angular client
    const clientPath = path.join(__dirname, '..', 'client', 'browser');

    // Start local agent: serves Angular client + native API routes
    const agentPort = await startLocalAgent(clientPath);
    console.log(`[Desktop] Local agent + client on http://localhost:${agentPort}`);
    console.log(`[Desktop] Embedded API server: http://localhost:${SERVER_PORT}`);

    createWindow();
  } catch (error) {
    console.error('Failed to start Adorable:', error);
    dialog.showErrorBox('Startup Error', `Failed to start Adorable: ${error}`);
    stopEmbeddedServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopEmbeddedServer();
});

app.on('window-all-closed', () => {
  stopEmbeddedServer();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
