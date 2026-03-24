import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HMRTriggerService {
  /**
   * Emit here to request a full preview reload.
   * The workspace component subscribes and calls its reloadIframe().
   */
  readonly reloadPreview$ = new Subject<void>();

  /**
   * Emit here to send RELOAD_TRANSLATIONS to the preview.
   * The workspace component subscribes and calls sendToPreview() which handles
   * both the docked webview (via executeJavaScript) and iframe cases.
   */
  readonly reloadTranslations$ = new Subject<{ content: string | null }>();

  triggerUpdate(_path: string, _content: string): void {}
  pause(): void {}
  resume(): void {}

  forceReload(): void {
    this.reloadPreview$.next();
  }

  /**
   * Ask the preview to reload translations via Angular's injector (no full page reload).
   * Passes the new translation content directly to avoid HTTP cache issues.
   * Falls back to window.location.reload() inside the preview if no translation service found.
   */
  reloadTranslations(content?: string): void {
    console.log('[HMR] reloadTranslations called, subscribers:', this.reloadTranslations$.observers?.length ?? '?');
    this.reloadTranslations$.next({ content: content ?? null });
  }
}
