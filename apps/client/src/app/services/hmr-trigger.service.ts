import { Injectable, inject } from '@angular/core';
import { Subject, groupBy, mergeMap, debounceTime } from 'rxjs';
import { SmartContainerEngine } from './smart-container.engine';

interface FileUpdate {
  path: string;
  content: string;
}

@Injectable({ providedIn: 'root' })
export class HMRTriggerService {
  private containerEngine = inject(SmartContainerEngine);
  private fileUpdates$ = new Subject<FileUpdate>();

  constructor() {
    // Group updates by path and debounce to avoid excessive writes
    this.fileUpdates$.pipe(
      groupBy(update => update.path),
      mergeMap(group$ => group$.pipe(debounceTime(100)))
    ).subscribe(async ({ path, content }) => {
      try {
        await this.containerEngine.writeFile(path, content);
        console.log(`[HMR] Updated ${path}`);
      } catch (err) {
        console.error(`[HMR] Failed to write ${path}:`, err);
      }
    });
  }

  triggerUpdate(path: string, content: string): void {
    this.fileUpdates$.next({ path, content });
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
