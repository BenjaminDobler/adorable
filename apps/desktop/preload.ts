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
  // Open a URL in the system default browser
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  // Preview window management (dock/undock for CDP access)
  previewUndock: (url: string) => ipcRenderer.invoke('preview:undock', url),
  previewDock: () => ipcRenderer.invoke('preview:dock'),
  previewNavigate: (url: string) => ipcRenderer.invoke('preview:navigate', url),
  previewGetState: () => ipcRenderer.invoke('preview:get-state'),
  onPreviewStateChanged: (callback: (state: { undocked: boolean; url: string | null }) => void) => {
    const listener = (_event: unknown, state: { undocked: boolean; url: string | null }) => callback(state);
    ipcRenderer.on('preview:state-changed', listener);
    return () => ipcRenderer.removeListener('preview:state-changed', listener);
  },
  // Send a command to the preview shell (e.g., toggle inspector)
  previewSendCommand: (command: any) => ipcRenderer.invoke('preview:send-command', command),
  // Listen for events relayed from the preview shell (element-selected, annotation-done, etc.)
  onPreviewEvent: (callback: (event: any) => void) => {
    const listener = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on('preview:event', listener);
    return () => ipcRenderer.removeListener('preview:event', listener);
  },
  // Cloud OAuth login: opens browser, returns JWT token
  cloudOAuthLogin: (cloudUrl: string, provider: string) =>
    ipcRenderer.invoke('cloud-oauth-login', cloudUrl, provider),
  // Auto-update progress events
  onUpdateDownloadStarted: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('update-download-started', listener);
    return () => ipcRenderer.removeListener('update-download-started', listener);
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    const listener = (_event: unknown, progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => callback(progress);
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },
  onUpdateDownloaded: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },
});
