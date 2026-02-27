import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class HMRTriggerService {
  constructor() {
    // file_written events from the AI generation stream already write files
    // to disk via DiskFileSystem on the server. The dev server (Angular CLI)
    // watches the filesystem and triggers HMR automatically — no mount needed.
    // mount() was only needed in the old WebContainers era where the dev server
    // ran in an isolated in-memory filesystem.
  }

  /**
   * No-op: files are already on disk, dev server watches natively.
   */
  triggerUpdate(_path: string, _content: string): void {}

  pause(): void {}
  resume(): void {}

  /**
   * Force a full reload if HMR fails or for structural changes
   */
  forceReload(): void {
    const iframe = document.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'RELOAD_REQ' }, '*');
    }
  }
}
