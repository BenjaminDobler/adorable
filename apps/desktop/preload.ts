import { contextBridge, ipcRenderer } from 'electron';

// Expose desktop info to the Angular client
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  // Embedded server URL for API calls (auth, projects, AI, etc.)
  serverUrl: 'http://localhost:' + (process.env['ADORABLE_SERVER_PORT'] || '3333'),
  // Local agent URL for native file/process operations
  nativeAgentUrl: 'http://localhost:' + (process.env['ADORABLE_AGENT_PORT'] || '3334'),
  // Get auto-login token for desktop mode (returns Promise<string>)
  getLocalUserToken: () => ipcRenderer.invoke('get-local-user-token'),
  // Fast screenshot capture via Electron's native capturePage
  capturePage: (rect?: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('capture-page', rect),
});
