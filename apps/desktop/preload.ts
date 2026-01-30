import { contextBridge } from 'electron';

// Expose desktop info to the Angular client
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  // Cloud server URL for API calls (auth, projects, AI, etc.)
  serverUrl: process.env['ADORABLE_SERVER_URL'] || 'http://localhost:3333',
  // Local agent URL for native file/process operations
  nativeAgentUrl: 'http://localhost:' + (process.env['ADORABLE_AGENT_PORT'] || '3334'),
});
