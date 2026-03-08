import { Injectable } from '@angular/core';

interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Injectable({
  providedIn: 'root'
})
export class ScreenshotService {
  private iframe: HTMLIFrameElement | null = null;
  private pendingCapture: { resolve: (data: string | null) => void } | null = null;

  constructor() {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'CAPTURE_RES' && this.pendingCapture) {
        this.pendingCapture.resolve(event.data.image);
        this.pendingCapture = null;
      }
      if (event.data.type === 'ADORABLE_SCREENSHOT_RES' && this.pendingCapture) {
        this.pendingCapture.resolve(event.data.image);
        this.pendingCapture = null;
      }
    });
  }

  registerIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  /**
   * Captures a thumbnail of the full preview iframe.
   * Tries methods in order: Electron → WebExtension → iframe html2canvas fallback.
   */
  async captureThumbnail(): Promise<string | null> {
    const iframe = this.iframe;
    if (!iframe || !iframe.contentWindow) {
      console.warn('[ScreenshotService] No active iframe to capture');
      return null;
    }

    const rect = iframe.getBoundingClientRect();
    return this.capture({
      viewportRect: rect,
      iframeFallbackRect: { x: 0, y: 0, width: iframe.clientWidth, height: iframe.clientHeight }
    });
  }

  /**
   * Captures a specific region (viewport coordinates) — used by the selection/annotation tool.
   * Same tiered approach: Electron → WebExtension → iframe html2canvas fallback.
   */
  async captureRegion(viewportRect: CaptureRect): Promise<string | null> {
    const iframe = this.iframe;
    if (!iframe || !iframe.contentWindow) {
      console.warn('[ScreenshotService] No active iframe to capture');
      return null;
    }

    const iframeRect = iframe.getBoundingClientRect();
    return this.capture({
      viewportRect,
      iframeFallbackRect: {
        x: viewportRect.x - iframeRect.left,
        y: viewportRect.y - iframeRect.top,
        width: viewportRect.width,
        height: viewportRect.height
      }
    });
  }

  private async capture(opts: {
    viewportRect: CaptureRect;
    iframeFallbackRect: CaptureRect;
  }): Promise<string | null> {
    const iframe = this.iframe;
    if (!iframe?.contentWindow) return null;

    // Tier 1: Electron capturePage (~10ms)
    const electronResult = await this.tryElectron(opts.viewportRect);
    if (electronResult) return electronResult;

    // Tier 2: WebExtension captureVisibleTab (~50ms)
    const extensionResult = await this.tryExtension(opts.viewportRect);
    if (extensionResult) return extensionResult;

    // Tier 3: iframe html2canvas fallback (~1-5s)
    return this.tryIframeFallback(iframe, opts.iframeFallbackRect);
  }

  private async tryElectron(rect: CaptureRect): Promise<string | null> {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.capturePage) return null;

    try {
      const dataUrl = await electronAPI.capturePage({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      });
      if (dataUrl) {
        console.log('[ScreenshotService] Captured via Electron');
      }
      return dataUrl || null;
    } catch (err) {
      console.warn('[ScreenshotService] Electron capture failed:', err);
      return null;
    }
  }

  private async tryExtension(rect: CaptureRect): Promise<string | null> {
    if (!(window as any).__adorableExtension) {
      return null;
    }

    console.log('[ScreenshotService] Trying WebExtension capture...');

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingCapture) {
          console.warn('[ScreenshotService] Extension capture timed out');
          this.pendingCapture = null;
          resolve(null);
        }
      }, 3000);

      this.pendingCapture = {
        resolve: (data) => {
          clearTimeout(timeout);
          if (data) {
            console.log('[ScreenshotService] Captured via WebExtension');
          }
          resolve(data);
        }
      };

      window.postMessage({
        type: 'ADORABLE_SCREENSHOT_REQ',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        devicePixelRatio: window.devicePixelRatio
      }, '*');
    });
  }

  private async tryIframeFallback(iframe: HTMLIFrameElement, rect: CaptureRect): Promise<string | null> {
    if (!iframe.contentWindow) return null;

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingCapture) {
          console.warn('[ScreenshotService] Iframe capture timed out');
          this.pendingCapture.resolve(null);
          this.pendingCapture = null;
        }
      }, 15000);

      this.pendingCapture = {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        }
      };

      console.log('[ScreenshotService] Falling back to iframe html2canvas');
      iframe.contentWindow!.postMessage({
        type: 'CAPTURE_REQ',
        rect
      }, '*');
    });
  }
}
