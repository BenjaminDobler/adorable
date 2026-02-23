import { Injectable, inject } from '@angular/core';
import { Subject, bufferTime, filter } from 'rxjs';
import { SmartContainerEngine } from './smart-container.engine';

interface FileUpdate {
  path: string;
  content: string;
}

@Injectable({ providedIn: 'root' })
export class HMRTriggerService {
  private containerEngine = inject(SmartContainerEngine);
  private fileUpdates$ = new Subject<FileUpdate>();
  private _paused = false;

  constructor() {
    // Batch all file updates within a 200ms window into a single mount call
    this.fileUpdates$.pipe(
      bufferTime(200),
      filter(updates => updates.length > 0)
    ).subscribe(async (updates) => {
      // Skip mounting if paused (project is switching)
      if (this._paused) return;

      // Deduplicate: keep only the last update per path
      const latestByPath = new Map<string, string>();
      for (const update of updates) {
        latestByPath.set(update.path, update.content);
      }

      // Build a single file tree for all updates
      const tree: any = {};
      for (const [path, content] of latestByPath) {
        const parts = path.split('/');
        const fileName = parts.pop()!;
        let current = tree;
        for (const part of parts) {
          if (!current[part]) {
            current[part] = { directory: {} };
          }
          current = current[part].directory;
        }
        current[fileName] = { file: { contents: content } };
      }

      try {
        await this.containerEngine.mount(tree);
        console.log(`[HMR] Mounted ${latestByPath.size} file(s)`);
      } catch (err) {
        console.error(`[HMR] Failed to mount ${latestByPath.size} file(s):`, err);
      }
    });
  }

  triggerUpdate(path: string, content: string): void {
    this.fileUpdates$.next({ path, content });
  }

  /**
   * Pause HMR updates (e.g. during project switch) to prevent
   * buffered file updates from bleeding into the new project.
   */
  pause(): void {
    this._paused = true;
  }

  /**
   * Resume HMR updates after project switch is complete.
   */
  resume(): void {
    this._paused = false;
  }

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
