/**
 * Returns the server base URL (no trailing slash).
 * - Electron: uses electronAPI.serverUrl
 * - Local dev (localhost): uses http://localhost:3333
 * - Production: uses '' (relative URL, same origin behind Nginx)
 */
export function getServerUrl(): string {
  const electronUrl = (window as any).electronAPI?.serverUrl;
  if (electronUrl) return electronUrl;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:3333';
  }
  return '';
}
