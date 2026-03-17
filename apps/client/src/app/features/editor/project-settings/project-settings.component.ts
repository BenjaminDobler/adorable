import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContainerEngine } from '../../../core/services/container-engine';
import { NativeContainerEngine } from '../../../core/services/native-container.engine';
import { ToastService } from '../../../core/services/toast';

@Component({
  selector: 'app-project-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-backdrop" (click)="close.emit()"></div>
    <div class="settings-dialog">
      <div class="settings-header">
        <h3>Project Settings</h3>
        <button class="close-btn" (click)="close.emit()">&times;</button>
      </div>

      <div class="settings-body">
        <section>
          <h4>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="2"/>
              <path d="M7 7h10M7 12h10M7 17h6"/>
            </svg>
            LocalStorage
          </h4>
          <p class="hint">Key-value pairs to set in the browser's localStorage before the app loads.</p>

          <div class="kv-list">
            @for (entry of localStorageEntries(); track $index) {
              <div class="kv-row">
                <input
                  type="text"
                  [value]="entry.key"
                  (input)="updateEntry('localStorage', $index, 'key', $any($event.target).value)"
                  placeholder="Key"
                  class="kv-key"
                />
                <input
                  type="text"
                  [value]="entry.value"
                  (input)="updateEntry('localStorage', $index, 'value', $any($event.target).value)"
                  placeholder="Value"
                  class="kv-value"
                />
                <button class="kv-delete" (click)="removeEntry('localStorage', $index)" title="Remove">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            }
            <button class="add-btn" (click)="addEntry('localStorage')">+ Add entry</button>
          </div>
        </section>

        <section>
          <h4>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
              <path d="M2 12h20"/>
            </svg>
            Cookies
          </h4>
          <p class="hint">Cookies to set before the app loads (e.g., session tokens).</p>

          <div class="kv-list">
            @for (entry of cookieEntries(); track $index) {
              <div class="kv-row">
                <input
                  type="text"
                  [value]="entry.key"
                  (input)="updateEntry('cookies', $index, 'key', $any($event.target).value)"
                  placeholder="Cookie name"
                  class="kv-key"
                />
                <input
                  type="text"
                  [value]="entry.value"
                  (input)="updateEntry('cookies', $index, 'value', $any($event.target).value)"
                  placeholder="Cookie value"
                  class="kv-value"
                />
                <button class="kv-delete" (click)="removeEntry('cookies', $index)" title="Remove">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            }
            <button class="add-btn" (click)="addEntry('cookies')">+ Add entry</button>
          </div>
        </section>
      </div>

      <div class="settings-footer">
        <button class="btn-cancel" (click)="close.emit()">Cancel</button>
        <button class="btn-save" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Saving...' : 'Save & Reload Preview' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .settings-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
    }
    .settings-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10001;
      background: var(--bg-surface-2, #1a1a1f);
      border: 1px solid var(--panel-border, rgba(255,255,255,0.06));
      border-radius: 16px;
      width: 560px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      color: var(--text-primary, #f0f0f2);
    }
    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--panel-border, rgba(255,255,255,0.06));
      h3 { margin: 0; font-size: 1.125rem; }
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted, #55555f);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      &:hover { color: var(--text-primary, #f0f0f2); }
    }
    .settings-body {
      padding: 1.25rem 1.5rem;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
    section {
      margin-bottom: 1.5rem;
      &:last-child { margin-bottom: 0; }
    }
    h4 {
      margin: 0 0 0.25rem;
      font-size: 0.875rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      svg { color: var(--text-muted, #55555f); }
    }
    .hint {
      margin: 0 0 0.75rem;
      font-size: 0.75rem;
      color: var(--text-muted, #55555f);
    }
    .kv-list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .kv-row {
      display: flex;
      gap: 0.375rem;
      align-items: center;
    }
    .kv-key, .kv-value {
      flex: 1;
      padding: 0.5rem 0.75rem;
      background: var(--bg-surface-1, #111114);
      border: 1px solid var(--panel-border, rgba(255,255,255,0.06));
      border-radius: 6px;
      color: var(--text-primary, #f0f0f2);
      font-size: 0.8125rem;
      font-family: monospace;
      &:focus {
        outline: none;
        border-color: var(--accent-color, #34d399);
      }
    }
    .kv-key { flex: 0.4; }
    .kv-value { flex: 0.6; }
    .kv-delete {
      background: none;
      border: none;
      color: var(--text-muted, #55555f);
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 4px;
      &:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
    }
    .add-btn {
      background: none;
      border: 1px dashed var(--panel-border, rgba(255,255,255,0.06));
      border-radius: 6px;
      color: var(--text-muted, #55555f);
      padding: 0.375rem;
      font-size: 0.75rem;
      cursor: pointer;
      &:hover {
        border-color: var(--accent-color, #34d399);
        color: var(--accent-color, #34d399);
      }
    }
    .settings-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--panel-border, rgba(255,255,255,0.06));
    }
    .btn-cancel {
      padding: 0.5rem 1rem;
      background: none;
      border: 1px solid var(--panel-border, rgba(255,255,255,0.06));
      border-radius: 8px;
      color: var(--text-secondary, #8a8a95);
      cursor: pointer;
      &:hover { background: var(--bg-surface-3, #222228); }
    }
    .btn-save {
      padding: 0.5rem 1.25rem;
      background: var(--accent-color, #34d399);
      border: none;
      border-radius: 8px;
      color: #000;
      font-weight: 600;
      cursor: pointer;
      &:hover { opacity: 0.9; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
  `],
})
export class ProjectSettingsComponent {
  private containerEngine = inject(ContainerEngine);
  private toastService = inject(ToastService);

  close = output();

  localStorageEntries = signal<{ key: string; value: string }[]>([]);
  cookieEntries = signal<{ key: string; value: string }[]>([]);
  saving = signal(false);

  constructor() {
    this.load();
  }

  async load() {
    try {
      const engine = this.getNativeEngine();
      if (!engine) return;
      const settings = await engine.getStorageSettings();
      this.localStorageEntries.set(
        Object.entries(settings.localStorage || {}).map(([key, value]) => ({ key, value }))
      );
      this.cookieEntries.set(
        Object.entries(settings.cookies || {}).map(([key, value]) => ({ key, value }))
      );
    } catch {
      // No settings yet
    }
  }

  addEntry(type: 'localStorage' | 'cookies') {
    if (type === 'localStorage') {
      this.localStorageEntries.update(e => [...e, { key: '', value: '' }]);
    } else {
      this.cookieEntries.update(e => [...e, { key: '', value: '' }]);
    }
  }

  removeEntry(type: 'localStorage' | 'cookies', index: number) {
    if (type === 'localStorage') {
      this.localStorageEntries.update(e => e.filter((_, i) => i !== index));
    } else {
      this.cookieEntries.update(e => e.filter((_, i) => i !== index));
    }
  }

  updateEntry(type: 'localStorage' | 'cookies', index: number, field: 'key' | 'value', val: string) {
    if (type === 'localStorage') {
      this.localStorageEntries.update(entries => {
        const copy = [...entries];
        copy[index] = { ...copy[index], [field]: val };
        return copy;
      });
    } else {
      this.cookieEntries.update(entries => {
        const copy = [...entries];
        copy[index] = { ...copy[index], [field]: val };
        return copy;
      });
    }
  }

  async save() {
    const engine = this.getNativeEngine();
    if (!engine) return;

    this.saving.set(true);
    try {
      const localStorage: Record<string, string> = {};
      for (const e of this.localStorageEntries()) {
        if (e.key.trim()) localStorage[e.key.trim()] = e.value;
      }
      const cookies: Record<string, string> = {};
      for (const e of this.cookieEntries()) {
        if (e.key.trim()) cookies[e.key.trim()] = e.value;
      }
      await engine.saveStorageSettings({ localStorage, cookies });
      this.toastService.show('Settings saved. Reloading preview...', 'success');

      // Reload the preview iframe to apply the new settings
      setTimeout(() => {
        const iframe = document.querySelector('iframe') as HTMLIFrameElement;
        if (iframe?.contentWindow) iframe.contentWindow.location.reload();
      }, 300);

      this.close.emit();
    } catch (e: any) {
      this.toastService.show('Failed to save settings', 'error');
    } finally {
      this.saving.set(false);
    }
  }

  private getNativeEngine(): NativeContainerEngine | null {
    const engine = this.containerEngine as any;
    // SmartContainerEngine wraps NativeContainerEngine
    return engine.nativeEngine || (engine.getStorageSettings ? engine : null);
  }
}
