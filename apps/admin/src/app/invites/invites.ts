import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-invites',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="invites-page">
      <h2>Registration & Invites</h2>

      <div class="mode-section">
        <label class="section-label">Registration Mode</label>
        <div class="mode-toggle">
          <button [class.active]="registrationMode() === 'open'" (click)="setMode('open')">Open</button>
          <button [class.active]="registrationMode() === 'invite-only'" (click)="setMode('invite-only')">Invite Only</button>
        </div>
      </div>

      <div class="invite-section">
        <div class="section-header">
          <h3>Invite Codes</h3>
          <button class="btn-primary" (click)="generateInvite()">Generate Code</button>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Created</th>
              <th>Status</th>
              <th>Used By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (invite of invites(); track invite.id) {
              <tr>
                <td>
                  <code class="invite-code">{{ invite.code }}</code>
                  <button class="btn-copy" (click)="copyCode(invite.code)">Copy</button>
                </td>
                <td>{{ invite.createdAt | date:'short' }}</td>
                <td>
                  @if (invite.usedBy) {
                    <span class="badge used">Used</span>
                  } @else if (invite.expiresAt && isExpired(invite.expiresAt)) {
                    <span class="badge expired">Expired</span>
                  } @else {
                    <span class="badge available">Available</span>
                  }
                </td>
                <td>{{ invite.usedBy || '—' }}</td>
                <td>
                  @if (!invite.usedBy) {
                    <button class="btn-small danger" (click)="deleteInvite(invite.id)">Delete</button>
                  }
                </td>
              </tr>
            }
            @if (invites().length === 0) {
              <tr><td colspan="5" class="empty">No invite codes yet</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .invites-page { padding: 0; }
    h2 { margin: 0 0 1.5rem; font-weight: 700; }
    h3 { margin: 0; font-weight: 600; }
    .section-label { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem; display: block; }
    .mode-section { margin-bottom: 2rem; }
    .mode-toggle {
      display: flex; gap: 0;
      button {
        padding: 0.5rem 1.25rem;
        background: var(--bg-surface-1);
        border: 1px solid var(--panel-border);
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.85rem;
        transition: all 0.2s var(--ease-out-expo);
        &:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
        &:last-child { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; border-left: none; }
        &.active { background: var(--accent-color); color: #000; border-color: var(--accent-color); }
      }
    }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .btn-primary {
      background: var(--accent-color);
      color: #000;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      box-shadow: 0 0 15px var(--accent-glow);
      transition: all 0.25s var(--ease-out-expo);
    }
    .btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); box-shadow: 0 0 20px var(--accent-glow-intense); }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th, .data-table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--panel-border); }
    .data-table th { color: var(--text-secondary); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
    .invite-code { background: var(--bg-surface-3); padding: 2px 8px; border-radius: var(--radius-xs); font-family: 'Space Mono', monospace; font-size: 0.9rem; }
    .btn-copy {
      background: none; border: none; color: var(--accent-color); cursor: pointer; font-size: 0.75rem; margin-left: 0.5rem;
    }
    .badge { padding: 2px 8px; border-radius: var(--radius-xs); font-size: 0.75rem; }
    .badge.available { background: rgba(52, 211, 153, 0.12); color: var(--success-color); }
    .badge.used { background: var(--bg-surface-2); color: var(--text-secondary); }
    .badge.expired { background: rgba(248, 113, 113, 0.12); color: var(--error-color); }
    .btn-small { background: var(--bg-surface-3); border: 1px solid var(--panel-border-hover); color: var(--text-secondary); padding: 4px 10px; border-radius: var(--radius-xs); cursor: pointer; font-size: 0.75rem; transition: all 0.2s var(--ease-out-expo); }
    .btn-small.danger { color: var(--error-color); }
    .btn-small.danger:hover { background: rgba(248, 113, 113, 0.1); }
    .empty { color: var(--text-muted); text-align: center; padding: 2rem !important; }
  `],
})
export class InvitesComponent implements OnInit {
  private api = inject(AdminApiService);
  invites = signal<any[]>([]);
  registrationMode = signal('open');

  ngOnInit() {
    this.loadInvites();
    this.loadConfig();
  }

  loadInvites() {
    this.api.getInvites().subscribe({ next: (i) => this.invites.set(i) });
  }

  loadConfig() {
    this.api.getConfig().subscribe({
      next: (c) => this.registrationMode.set(c['registration.mode'] || 'open'),
    });
  }

  setMode(mode: string) {
    this.registrationMode.set(mode);
    this.api.updateConfig({ 'registration.mode': mode }).subscribe();
  }

  generateInvite() {
    this.api.createInvite().subscribe({ next: () => this.loadInvites() });
  }

  deleteInvite(id: string) {
    this.api.deleteInvite(id).subscribe({ next: () => this.loadInvites() });
  }

  copyCode(code: string) {
    navigator.clipboard.writeText(code);
  }

  isExpired(date: string): boolean {
    return new Date(date) < new Date();
  }
}
