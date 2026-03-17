import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as os from 'os';
import { fork, ChildProcess } from 'child_process';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import { ensureNode } from './node-bootstrap';
import { startLocalAgent, setPreviewManager, setOpenExternalHandler, setPreviewEventCallback } from './local-agent';
import { getOrCreateJwtSecret } from './jwt-secret';
import { initializeDatabase } from './db-init';
import { PreviewWindowManager } from './preview-window';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let localUserToken: string | null = null;
let previewManager: PreviewWindowManager | null = null;

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

  // Enable dev tools in dev mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

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
      ADORABLE_DESKTOP_MODE: 'true',
      // Projects dir uses a space-free path — esbuild (Angular CLI) fails on paths with spaces
      ADORABLE_PROJECTS_DIR: path.join(os.homedir(), '.adorable', 'projects')
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

/**
 * Sets up the auto-updater using electron-updater.
 * Prompts the user via native dialogs before downloading or installing updates.
 */
function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log('[Desktop] Skipping auto-update in dev mode');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.logger = {
    info: (msg: unknown) => console.log('[AutoUpdater]', msg),
    warn: (msg: unknown) => console.warn('[AutoUpdater]', msg),
    error: (msg: unknown) => console.error('[AutoUpdater]', msg),
    debug: (msg: unknown) => console.log('[AutoUpdater][debug]', msg),
  };

  autoUpdater.on('update-available', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available. Download now?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          mainWindow?.webContents.send('update-download-started');
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
      mainWindow.webContents.send('update-download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) {
      mainWindow.setProgressBar(-1); // Remove progress bar
      mainWindow.webContents.send('update-downloaded');
    }
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. Restart now to apply?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
  });

  // Check for updates 10 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Check failed:', err.message);
    });
  }, 10_000);
}

/**
 * Builds the native application menu.
 * Includes a "Check for Updates..." item and standard Edit/View/Window menus.
 */
function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Check for Updates...',
                click: () => {
                  autoUpdater
                    .checkForUpdates()
                    .then((result) => {
                      if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
                        dialog.showMessageBox({
                          type: 'info',
                          title: 'No Updates',
                          message: "You're up to date!",
                          detail: `Adorable ${app.getVersion()} is the latest version.`,
                        });
                      }
                    })
                    .catch(() => {
                      dialog.showMessageBox({
                        type: 'error',
                        title: 'Update Check Failed',
                        message: 'Could not check for updates. Please try again later.',
                      });
                    });
                },
              },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } as Electron.MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: isMac ? 'Cmd+O' : 'Ctrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-folder');
            }
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

    // Register IPC handler for server port (used by preload)
    ipcMain.on('get-server-port', (event) => {
      event.returnValue = SERVER_PORT;
    });

    // Register IPC handler for agent port (used by preload)
    ipcMain.on('get-agent-port', (event) => {
      event.returnValue = AGENT_PORT;
    });

    // Register IPC handler for opening a folder dialog (desktop "Open Folder" feature)
    ipcMain.handle('open-folder-dialog', async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory'],
        title: 'Open Angular/Nx Project',
      });
      return result.canceled ? null : result.filePaths[0];
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

    // Open a URL in the system default browser (validated to http/https only)
    ipcMain.handle('open-external', async (_event, url: string) => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        throw new Error('Only http and https URLs are allowed');
      }
      await shell.openExternal(url);
    });

    // --- Preview Window IPC Handlers ---
    ipcMain.handle('preview:undock', async (_event, url: string) => {
      if (!previewManager) return { error: 'Not initialized' };
      await previewManager.undock(url);
      return { success: true };
    });

    ipcMain.handle('preview:dock', async () => {
      if (!previewManager) return { error: 'Not initialized' };
      await previewManager.dock();
      return { success: true };
    });

    ipcMain.handle('preview:navigate', async (_event, url: string) => {
      if (!previewManager) return { error: 'Not initialized' };
      await previewManager.navigate(url);
      return { success: true };
    });

    ipcMain.handle('preview:get-state', () => {
      return previewManager?.getState() ?? { undocked: false, url: null };
    });

    // Send a command to the preview shell (inspect toggle, etc.)
    ipcMain.handle('preview:send-command', async (_event, command: any) => {
      if (!previewManager) return { error: 'Not initialized' };
      previewManager.sendToShell(command);
      return { success: true };
    });

    // Cloud OAuth login: creates a temp localhost server, opens OAuth in system browser,
    // waits for the callback with a JWT token, then returns it to the renderer.
    ipcMain.handle('cloud-oauth-login', async (_event, cloudUrl: string, provider: string) => {
      return new Promise<string>((resolve, reject) => {
        const server = http.createServer((req, res) => {
          const reqUrl = new URL(req.url || '/', `http://127.0.0.1`);
          if (reqUrl.pathname === '/callback') {
            const token = reqUrl.searchParams.get('token');
            const error = reqUrl.searchParams.get('error');

            res.writeHead(200, { 'Content-Type': 'text/html' });
            if (token) {
              res.end('<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#fff"><h2>Connected! You can close this tab.</h2></body></html>');
            } else {
              res.end('<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#fff"><h2>Authentication failed. You can close this tab.</h2></body></html>');
            }

            cleanup();

            if (token) {
              resolve(token);
            } else {
              reject(new Error(error || 'OAuth failed'));
            }
          } else {
            res.writeHead(404);
            res.end();
          }
        });

        // Bind to 127.0.0.1 only (not 0.0.0.0)
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (!addr || typeof addr === 'string') {
            cleanup();
            return reject(new Error('Failed to start temp server'));
          }
          const port = addr.port;
          const desktopRedirect = `http://127.0.0.1:${port}/callback`;
          const authUrl = `${cloudUrl}/api/auth/social/${provider}/auth?redirect=true&desktop_redirect=${encodeURIComponent(desktopRedirect)}`;
          shell.openExternal(authUrl);
        });

        // 5-minute timeout
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('OAuth timed out'));
        }, 5 * 60 * 1000);

        function cleanup() {
          clearTimeout(timeout);
          try { server.close(); } catch {}
        }
      });
    });

    // Set ADORABLE_PROJECTS_DIR in the main process env so the local agent
    // (NativeManager) uses the same directory as the embedded server.
    // Uses a space-free path — esbuild (Angular CLI) fails on paths with spaces
    // like "Application Support".
    process.env['ADORABLE_PROJECTS_DIR'] = path.join(os.homedir(), '.adorable', 'projects');

    // Start the embedded backend server
    console.log('[Desktop] Starting embedded server...');
    await startEmbeddedServer();

    // Path to the built Angular client
    const clientPath = path.join(__dirname, '..', 'client', 'browser');

    // Start local agent: serves Angular client + native API routes
    const agentPort = await startLocalAgent(clientPath);
    console.log(`[Desktop] Local agent + client on http://localhost:${agentPort}`);
    console.log(`[Desktop] Embedded API server: http://localhost:${SERVER_PORT}`);

    // Clear browser cache to ensure fresh client chunks are loaded after rebuilds
    await session.defaultSession.clearCache();


    createWindow();



    // Initialize preview window manager (for dockable preview + CDP)
    if (mainWindow) {
      previewManager = new PreviewWindowManager(mainWindow, app.getPath('userData'), AGENT_PORT);
      setPreviewManager(previewManager);
      setOpenExternalHandler((url) => shell.openExternal(url));
      setPreviewEventCallback((event) => {
        // Forward preview shell events to the main window renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('preview:event', event);
        }
      });
      console.log('[Desktop] Preview window manager initialized');
    }

    setupApplicationMenu();
    setupAutoUpdater();
  } catch (error) {
    console.error('Failed to start Adorable:', error);
    dialog.showErrorBox('Startup Error', `Failed to start Adorable: ${error}`);
    stopEmbeddedServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  previewManager?.destroy();
  stopEmbeddedServer();
});

app.on('window-all-closed', () => {
  // Don't quit if only the preview window closed (mainWindow is still alive)
  if (!mainWindow) {
    stopEmbeddedServer();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
