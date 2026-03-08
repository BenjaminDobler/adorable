import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-page">
      <h2>Settings</h2>

      @if (loaded()) {
        <div class="settings-section">
          <h3>Containers</h3>
          <div class="form-group">
            <label>Max Active Containers</label>
            <input type="number" [(ngModel)]="config['containers.maxActive']" min="1" max="50" />
          </div>
        </div>

        <div class="settings-section">
          <h3>Cloud Editor Access</h3>
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" [checked]="config['cloudEditor.accessMode'] === 'allowlist'" (change)="toggleCloudEditorAccess($event)" />
              Restrict cloud editor to allowed users only
            </label>
            <p class="hint">When enabled, only users explicitly marked as "allowed" in the Users panel can use the cloud editor. Admins always have access. Other users will be prompted to download the desktop app.</p>
          </div>
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" [checked]="config['cloudEditor.defaultAccess'] !== 'false'" (change)="toggleDefaultAccess($event)" />
              Grant cloud editor access to new users by default
            </label>
            <p class="hint">When disabled, new users will not have cloud editor access until an admin explicitly allows them in the Users panel.</p>
          </div>
        </div>

        <div class="settings-section">
          <h3>Email Verification</h3>
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" [checked]="config['registration.emailVerification'] === 'true'" (change)="toggleEmailVerification($event)" />
              Require email verification for new accounts
            </label>
          </div>
        </div>

        <div class="settings-section">
          <h3>SMTP Configuration</h3>
          <div class="form-group">
            <label>Host</label>
            <input type="text" [(ngModel)]="config['smtp.host']" placeholder="smtp.example.com" />
          </div>
          <div class="form-group">
            <label>Port</label>
            <input type="number" [(ngModel)]="config['smtp.port']" placeholder="587" />
          </div>
          <div class="form-group">
            <label>User</label>
            <input type="text" [(ngModel)]="config['smtp.user']" placeholder="user@example.com" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" [(ngModel)]="config['smtp.pass']" />
          </div>
          <div class="form-group">
            <label>From Address</label>
            <input type="email" [(ngModel)]="config['smtp.from']" placeholder="noreply@example.com" />
          </div>
        </div>

        <div class="save-section">
          <button class="btn-save" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Settings' }}
          </button>
          @if (saved()) {
            <span class="saved-msg">Settings saved</span>
          }
        </div>
      } @else {
        <p class="loading">Loading settings...</p>
      }
    </div>
  `,
  styles: [`
    .settings-page { padding: 0; max-width: 640px; }
    h2 { margin: 0 0 1.5rem; font-weight: 700; }
    h3 { margin: 0 0 1rem; font-weight: 600; font-size: 1rem; color: var(--text-primary); }
    .settings-section {
      background: var(--bg-surface-1);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .form-group {
      margin-bottom: 1rem;
      &:last-child { margin-bottom: 0; }
      label { display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.375rem; font-weight: 600; }
      input[type="text"],
      input[type="number"],
      input[type="email"],
      input[type="password"] {
        width: 100%;
        background: var(--bg-surface-2);
        border: 1px solid var(--panel-border);
        border-radius: var(--radius-sm);
        padding: 0.5rem 0.75rem;
        color: var(--text-primary);
        font-size: 0.875rem;
        box-sizing: border-box;
        transition: all 0.25s var(--ease-out-expo);
        &:focus { outline: none; border-color: var(--accent-color); box-shadow: 0 0 0 3px var(--accent-glow); }
      }
    }
    .toggle-label {
      display: flex !important;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem !important;
      color: var(--text-primary) !important;
      input[type="checkbox"] { width: auto; }
    }
    .save-section { display: flex; align-items: center; gap: 1rem; }
    .btn-save {
      background: var(--accent-color);
      color: #000;
      border: none;
      padding: 0.625rem 1.5rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-weight: 600;
      font-size: 0.875rem;
      box-shadow: 0 0 15px var(--accent-glow);
      transition: all 0.25s var(--ease-out-expo);
      &:hover { background: var(--accent-hover); transform: translateY(-1px); box-shadow: 0 0 20px var(--accent-glow-intense); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .saved-msg { color: var(--success-color); font-size: 0.85rem; }
    .hint { font-size: 0.8rem; color: var(--text-muted); margin: 0.5rem 0 0; line-height: 1.4; }
    .loading { color: var(--text-secondary); }
  `],
})
export class SettingsComponent implements OnInit {
  private api = inject(AdminApiService);
  config: Record<string, string> = {};
  loaded = signal(false);
  saving = signal(false);
  saved = signal(false);

  ngOnInit() {
    this.api.getConfig().subscribe({
      next: (c) => {
        this.config = c;
        this.loaded.set(true);
      },
    });
  }

  toggleCloudEditorAccess(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.config['cloudEditor.accessMode'] = checked ? 'allowlist' : 'open';
  }

  toggleDefaultAccess(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.config['cloudEditor.defaultAccess'] = checked ? 'true' : 'false';
  }

  toggleEmailVerification(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.config['registration.emailVerification'] = checked ? 'true' : 'false';
  }

  save() {
    this.saving.set(true);
    this.saved.set(false);
    this.api.updateConfig(this.config).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => this.saving.set(false),
    });
  }
}
