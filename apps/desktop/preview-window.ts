/**
 * Preview Window Manager — Manages a separate BrowserWindow for the app preview.
 * The window loads a toolbar shell (served by local-agent) with the dev server
 * in an iframe. CDP operations target the iframe for direct app inspection.
 */
import { BrowserWindow, WebFrameMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface ConsoleMessage {
  level: string;
  text: string;
  timestamp: number;
}

interface PreviewState {
  undocked: boolean;
  url: string | null;
}

const MAX_CONSOLE_BUFFER = 1000;

export class PreviewWindowManager {
  private previewWindow: BrowserWindow | null = null;
  private consoleBuffer: ConsoleMessage[] = [];
  private savedBounds: Electron.Rectangle | null = null;
  private boundsFile: string;
  private isDebuggerAttached = false;
  private currentPreviewUrl: string | null = null;
  private iframeTargetId: string | null = null;

  constructor(
    private mainWindow: BrowserWindow,
    userDataPath: string,
    private agentPort: number = 3334
  ) {
    this.boundsFile = path.join(userDataPath, 'preview-bounds.json');
    this.loadBounds();
  }

  async undock(url: string): Promise<void> {
    this.currentPreviewUrl = url;

    if (this.previewWindow) {
      // Already undocked — navigate the inner iframe
      this.navigateIframe(url);
      this.previewWindow.focus();
      return;
    }

    const mainBounds = this.mainWindow.getBounds();

    const bounds = this.savedBounds || {
      x: mainBounds.x + mainBounds.width + 10,
      y: mainBounds.y,
      width: 800,
      height: 600,
    };

    this.previewWindow = new BrowserWindow({
      ...bounds,
      title: 'Adorable Preview',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Load the preview shell (toolbar + iframe) from the local agent
    const shellUrl = `http://localhost:${this.agentPort}/api/native/preview-shell?url=${encodeURIComponent(url)}`;
    this.previewWindow.loadURL(shellUrl);

    // Attach CDP debugger after page loads
    this.previewWindow.webContents.on('did-finish-load', () => {
      this.attachDebugger();
    });

    // Save bounds on move/resize (debounced)
    let boundsTimer: ReturnType<typeof setTimeout> | null = null;
    const saveBoundsDebounced = () => {
      if (boundsTimer) clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        if (this.previewWindow) {
          this.savedBounds = this.previewWindow.getBounds();
          this.persistBounds();
        }
      }, 500);
    };
    this.previewWindow.on('move', saveBoundsDebounced);
    this.previewWindow.on('resize', saveBoundsDebounced);

    // Auto-dock back when preview window is closed by user
    this.previewWindow.on('closed', () => {
      this.isDebuggerAttached = false;
      this.iframeTargetId = null;
      this.previewWindow = null;
      this.consoleBuffer = [];
      this.notifyStateChanged();
    });

    this.notifyStateChanged();
  }

  async dock(): Promise<void> {
    if (!this.previewWindow) return;

    this.savedBounds = this.previewWindow.getBounds();
    this.persistBounds();
    this.detachDebugger();
    this.previewWindow.destroy();
    this.previewWindow = null;
    this.iframeTargetId = null;
    this.consoleBuffer = [];
    this.notifyStateChanged();
  }

  async navigate(url: string): Promise<void> {
    this.currentPreviewUrl = url;
    if (this.previewWindow) {
      this.navigateIframe(url);
    }
  }

  getState(): PreviewState {
    return {
      undocked: this.previewWindow !== null,
      url: this.currentPreviewUrl,
    };
  }

  isUndocked(): boolean {
    return this.previewWindow !== null;
  }

  // --- CDP Operations (target the iframe, not the shell) ---

  async captureScreenshot(): Promise<string> {
    this.ensurePreviewWindow();

    // Try to capture just the iframe content via CDP target
    const sessionId = await this.getIframeSessionId();
    if (sessionId && this.isDebuggerAttached) {
      try {
        const result = await this.previewWindow!.webContents.debugger.sendCommand(
          'Page.captureScreenshot',
          { format: 'png' },
          sessionId
        );
        return result.data;
      } catch {
        // Fall through to whole-window capture
      }
    }

    // Fallback: capture the entire preview window (includes toolbar)
    if (this.isDebuggerAttached) {
      try {
        const result = await this.previewWindow!.webContents.debugger.sendCommand(
          'Page.captureScreenshot',
          { format: 'png' }
        );
        return result.data;
      } catch {
        // Fall through
      }
    }

    const image = await this.previewWindow!.webContents.capturePage();
    return image.toPNG().toString('base64');
  }

  async evaluate(expression: string): Promise<any> {
    this.ensurePreviewWindow();

    // Try executing in the iframe context via Electron's frame API
    const iframeFrame = this.getIframeFrame();
    if (iframeFrame) {
      return iframeFrame.executeJavaScript(expression);
    }

    // Fallback: execute in the shell page, targeting the iframe
    const wrappedExpr = `
      (function() {
        const iframe = document.getElementById('preview-iframe');
        if (!iframe || !iframe.contentWindow) throw new Error('Preview iframe not found');
        return iframe.contentWindow.eval(${JSON.stringify(expression)});
      })()
    `;
    return this.previewWindow!.webContents.executeJavaScript(wrappedExpr);
  }

  async getAccessibilityTree(): Promise<any> {
    this.ensurePreviewWindow();
    this.ensureDebugger();

    const sessionId = await this.getIframeSessionId();
    const result = await this.previewWindow!.webContents.debugger.sendCommand(
      'Accessibility.getFullAXTree',
      {},
      sessionId || undefined
    );
    return this.formatAccessibilityTree(result.nodes);
  }

  getConsoleMessages(clear = true): ConsoleMessage[] {
    const messages = [...this.consoleBuffer];
    if (clear) this.consoleBuffer = [];
    return messages;
  }

  async navigateCDP(url: string): Promise<void> {
    this.currentPreviewUrl = url;
    this.ensurePreviewWindow();
    this.navigateIframe(url);

    // Wait a bit for navigation to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  }

  async click(x: number, y: number): Promise<void> {
    this.ensurePreviewWindow();
    this.ensureDebugger();

    // Offset y by the toolbar height (~37px) to map to the iframe content
    const toolbarHeight = 37;
    const adjustedY = y + toolbarHeight;

    const debugger_ = this.previewWindow!.webContents.debugger;
    await debugger_.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y: adjustedY,
      button: 'left',
      clickCount: 1,
    });
    await debugger_.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y: adjustedY,
      button: 'left',
      clickCount: 1,
    });
  }

  /**
   * Send a command to the preview shell page (e.g., toggle inspector).
   */
  sendToShell(command: any): void {
    if (!this.previewWindow) return;
    this.previewWindow.webContents.executeJavaScript(
      `handleShellCommand(${JSON.stringify(command)})`
    ).catch(() => {});
  }

  destroy(): void {
    if (this.previewWindow) {
      this.detachDebugger();
      this.previewWindow.destroy();
      this.previewWindow = null;
    }
  }

  // --- Private helpers ---

  /**
   * Navigate the iframe inside the preview shell via postMessage.
   */
  private navigateIframe(url: string): void {
    if (!this.previewWindow) return;
    this.previewWindow.webContents.executeJavaScript(
      `navigatePreview(${JSON.stringify(url)})`
    ).catch(() => {});
  }

  /**
   * Get the WebFrameMain for the iframe inside the preview shell.
   * This allows executing JavaScript directly in the iframe context.
   */
  private getIframeFrame(): WebFrameMain | null {
    if (!this.previewWindow) return null;
    const frames = this.previewWindow.webContents.mainFrame.frames;
    // The iframe is the first (and usually only) child frame
    return frames.length > 0 ? frames[0] : null;
  }

  /**
   * Find the CDP session ID for the iframe target, so CDP commands
   * can be sent directly to the iframe's page context.
   */
  private async getIframeSessionId(): Promise<string | null> {
    if (!this.isDebuggerAttached || !this.previewWindow) return null;

    // If we already have it cached, return it
    if (this.iframeTargetId) {
      try {
        const result = await this.previewWindow.webContents.debugger.sendCommand(
          'Target.attachToTarget',
          { targetId: this.iframeTargetId, flatten: true }
        );
        return result.sessionId || null;
      } catch {
        this.iframeTargetId = null;
      }
    }

    try {
      // Find the iframe target
      const { targetInfos } = await this.previewWindow.webContents.debugger.sendCommand(
        'Target.getTargets'
      );
      const iframeTarget = targetInfos?.find(
        (t: any) => t.type === 'iframe' && t.url && t.url.includes('localhost')
      );
      if (iframeTarget) {
        this.iframeTargetId = iframeTarget.targetId;
        const result = await this.previewWindow.webContents.debugger.sendCommand(
          'Target.attachToTarget',
          { targetId: iframeTarget.targetId, flatten: true }
        );
        return result.sessionId || null;
      }
    } catch {
      // Target API may not be available
    }
    return null;
  }

  private attachDebugger(): void {
    if (!this.previewWindow || this.isDebuggerAttached) return;
    try {
      this.previewWindow.webContents.debugger.attach('1.3');
      this.isDebuggerAttached = true;

      // Enable CDP domains
      const debugger_ = this.previewWindow.webContents.debugger;
      debugger_.sendCommand('Runtime.enable').catch(() => {});
      debugger_.sendCommand('Page.enable').catch(() => {});
      debugger_.sendCommand('Target.setDiscoverTargets', { discover: true }).catch(() => {});

      // Listen for console messages (from both shell and iframe)
      debugger_.on('message', (_event, method, params) => {
        if (method === 'Runtime.consoleAPICalled') {
          const text = (params.args || [])
            .map((arg: any) => arg.value ?? arg.description ?? String(arg))
            .join(' ');
          // Skip console messages from the shell itself
          if (text.includes('[PreviewShell]')) return;
          this.consoleBuffer.push({
            level: params.type || 'log',
            text,
            timestamp: Date.now(),
          });
          if (this.consoleBuffer.length > MAX_CONSOLE_BUFFER) {
            this.consoleBuffer = this.consoleBuffer.slice(-MAX_CONSOLE_BUFFER);
          }
        }
      });

      console.log('[PreviewWindow] CDP debugger attached');
    } catch (err) {
      console.warn('[PreviewWindow] Failed to attach debugger:', err);
      this.isDebuggerAttached = false;
    }
  }

  private detachDebugger(): void {
    if (!this.previewWindow || !this.isDebuggerAttached) return;
    try {
      this.previewWindow.webContents.debugger.detach();
    } catch {
      // already detached
    }
    this.isDebuggerAttached = false;
  }

  private ensurePreviewWindow(): void {
    if (!this.previewWindow) {
      throw new Error('Preview window is not open. Undock the preview first.');
    }
  }

  private ensureDebugger(): void {
    this.ensurePreviewWindow();
    if (!this.isDebuggerAttached) {
      this.attachDebugger();
      if (!this.isDebuggerAttached) {
        throw new Error('CDP debugger is not attached to the preview window.');
      }
    }
  }

  private notifyStateChanged(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('preview:state-changed', this.getState());
    }
  }

  private formatAccessibilityTree(nodes: any[]): any[] {
    if (!nodes) return [];
    return nodes
      .filter((n: any) => n.role?.value && n.role.value !== 'none')
      .map((n: any) => ({
        role: n.role?.value,
        name: n.name?.value || '',
        description: n.description?.value || '',
        value: n.value?.value || '',
        children: n.childIds?.length || 0,
        nodeId: n.nodeId,
      }));
  }

  private loadBounds(): void {
    try {
      if (fs.existsSync(this.boundsFile)) {
        this.savedBounds = JSON.parse(fs.readFileSync(this.boundsFile, 'utf-8'));
      }
    } catch {
      // ignore
    }
  }

  private persistBounds(): void {
    try {
      if (this.savedBounds) {
        fs.writeFileSync(this.boundsFile, JSON.stringify(this.savedBounds));
      }
    } catch {
      // ignore
    }
  }
}
