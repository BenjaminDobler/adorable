import { contextBridge, ipcRenderer } from 'electron';

// Get ports from main process via synchronous IPC (reliable across all build modes)
const serverPort = ipcRenderer.sendSync('get-server-port') || 3333;
const agentPort = ipcRenderer.sendSync('get-agent-port') || 3334;

// Expose desktop info to the Angular client
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  // Embedded server URL for API calls (auth, projects, AI, etc.)
  serverUrl: 'http://localhost:' + serverPort,
  // Local agent URL for native file/process operations
  nativeAgentUrl: 'http://localhost:' + agentPort,
  // Get auto-login token for desktop mode (returns Promise<string>)
  getLocalUserToken: () => ipcRenderer.invoke('get-local-user-token'),
  // Fast screenshot capture via Electron's native capturePage
  capturePage: (rect?: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('capture-page', rect),
});
