import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { ensureNode } from './node-bootstrap';
import { startLocalAgent } from './local-agent';

let mainWindow: BrowserWindow | null = null;

// Cloud server URL for API calls — configurable via env
const SERVER_URL = process.env['ADORABLE_SERVER_URL'] || 'http://localhost:3333';
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

app.on('ready', async () => {
  try {
    await ensureNode();

    // Path to the built Angular client
    const clientPath = path.join(__dirname, '..', 'client', 'browser');

    // Start local agent: serves Angular client + native API routes
    const agentPort = await startLocalAgent(clientPath);
    console.log(`[Desktop] Local agent + client on http://localhost:${agentPort}`);
    console.log(`[Desktop] Cloud API server: ${SERVER_URL}`);

    createWindow();
  } catch (error) {
    console.error('Failed to start Adorable:', error);
    dialog.showErrorBox('Startup Error', `Failed to start Adorable: ${error}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
