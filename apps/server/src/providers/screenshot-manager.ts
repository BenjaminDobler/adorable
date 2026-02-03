import { EventEmitter } from 'events';

interface PendingScreenshot {
  resolve: (data: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Manages screenshot requests between the AI tool and the client.
 *
 * Flow:
 * 1. AI calls take_screenshot tool
 * 2. Server creates a request with unique ID and sends SSE event to client
 * 3. Client captures iframe and POSTs image to /api/screenshot/:requestId
 * 4. Server resolves the pending promise and returns image to AI
 */
class ScreenshotManager {
  private pendingRequests = new Map<string, PendingScreenshot>();
  private requestCounter = 0;

  /**
   * Create a screenshot request and wait for client response.
   * @param onRequest Callback to notify client (via SSE) about the request
   * @param timeoutMs Timeout in milliseconds (default: 30 seconds)
   */
  async requestScreenshot(
    onRequest: (requestId: string) => void,
    timeoutMs = 30000
  ): Promise<string> {
    const requestId = `screenshot-${Date.now()}-${++this.requestCounter}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Screenshot request timed out. The client may not be connected or the preview is not available.'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Notify client via SSE callback
      onRequest(requestId);
    });
  }

  /**
   * Called when client POSTs the screenshot data.
   */
  resolveScreenshot(requestId: string, imageData: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`[Screenshot] No pending request found for ID: ${requestId}`);
      return false;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.resolve(imageData);
    return true;
  }

  /**
   * Called if client reports an error capturing the screenshot.
   */
  rejectScreenshot(requestId: string, error: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.reject(new Error(error));
    return true;
  }

  /**
   * Check if there's a pending request.
   */
  hasPendingRequest(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }
}

// Singleton instance
export const screenshotManager = new ScreenshotManager();
