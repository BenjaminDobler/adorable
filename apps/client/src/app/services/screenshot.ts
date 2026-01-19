import { Injectable, signal } from '@angular/core';

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
    });
  }

  registerIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  async captureThumbnail(): Promise<string | null> {
    const iframe = this.iframe;
    if (!iframe || !iframe.contentWindow) {
      console.warn('[ScreenshotService] No active iframe to capture');
      return null;
    }

    return new Promise((resolve) => {
      // Timeout fallback
      const timeout = setTimeout(() => {
        if (this.pendingCapture) {
          console.warn('[ScreenshotService] Capture timed out');
          this.pendingCapture.resolve(null);
          this.pendingCapture = null;
        }
      }, 5000);

      this.pendingCapture = { 
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        }
      };

      console.log('[ScreenshotService] Sending CAPTURE_REQ');
      iframe.contentWindow!.postMessage({
        type: 'CAPTURE_REQ',
        rect: { x: 0, y: 0, width: iframe.clientWidth, height: iframe.clientHeight }
      }, '*');
    });
  }
}
