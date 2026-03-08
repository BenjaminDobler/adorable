import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="users-page">
      <h2>Users</h2>

      <table class="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Verified</th>
            @if (allowlistMode()) {
              <th>Cloud Editor</th>
            }
            <th>Projects</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (user of users(); track user.id) {
            <tr [class.disabled]="!user.isActive">
              <td>{{ user.email }}</td>
              <td>{{ user.name || '—' }}</td>
              <td>
                <span class="badge" [class.admin]="user.role === 'admin'">{{ user.role }}</span>
              </td>
              <td>
                <span class="status-dot" [class.active]="user.isActive"></span>
                {{ user.isActive ? 'Active' : 'Disabled' }}
              </td>
              <td>{{ user.emailVerified ? 'Yes' : 'No' }}</td>
              @if (allowlistMode()) {
                <td>
                  @if (user.role === 'admin') {
                    <span class="badge admin">Always</span>
                  } @else {
                    <button class="btn-small" [class.allowed]="user.cloudEditorAllowed" (click)="toggleCloudEditor(user)">
                      {{ user.cloudEditorAllowed ? 'Allowed' : 'Blocked' }}
                    </button>
                  }
                </td>
              }
              <td>{{ user.projectCount }}</td>
              <td>{{ user.createdAt | date:'shortDate' }}</td>
              <td class="actions">
                <button class="btn-small" (click)="toggleActive(user)" [title]="user.isActive ? 'Disable' : 'Enable'">
                  {{ user.isActive ? 'Disable' : 'Enable' }}
                </button>
                <button class="btn-small" (click)="toggleRole(user)" [title]="user.role === 'admin' ? 'Demote' : 'Promote'">
                  {{ user.role === 'admin' ? 'Demote' : 'Promote' }}
                </button>
                <button class="btn-small export" (click)="exportData(user)" [disabled]="exporting()">Export</button>
                <button class="btn-small danger" (click)="deleteUser(user)">Delete</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .users-page { padding: 0; }
    h2 { margin: 0 0 1.5rem; font-weight: 700; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    .data-table th, .data-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--panel-border);
    }
    .data-table th { color: var(--text-secondary); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
    tr.disabled { opacity: 0.5; }
    .badge {
      background: var(--bg-surface-3);
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    .badge.admin { background: var(--accent-color); color: #000; }
    .status-dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--error-color);
      margin-right: 4px;
    }
    .status-dot.active { background: var(--success-color); }
    .actions { display: flex; gap: 0.5rem; }
    .btn-small {
      background: var(--bg-surface-3);
      border: 1px solid var(--panel-border-hover);
      color: var(--text-secondary);
      padding: 4px 10px;
      border-radius: var(--radius-xs);
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.2s var(--ease-out-expo);
    }
    .btn-small:hover { background: var(--bg-surface-4); color: var(--text-primary); }
    .btn-small.allowed { color: var(--success-color); border-color: rgba(52, 211, 153, 0.2); }
    .btn-small.danger { color: var(--error-color); }
    .btn-small.danger:hover { background: rgba(248, 113, 113, 0.1); }
    .btn-small.export { color: var(--accent-blue); }
    .btn-small.export:hover { background: rgba(96, 165, 250, 0.1); }
    .btn-small:disabled { opacity: 0.4; cursor: not-allowed; }
  `],
})
export class UsersComponent implements OnInit {
  private api = inject(AdminApiService);
  users = signal<any[]>([]);
  allowlistMode = signal(false);
  exporting = signal(false);

  ngOnInit() {
    this.load();
    this.api.getConfig().subscribe({
      next: (config) => this.allowlistMode.set(config['cloudEditor.accessMode'] === 'allowlist'),
    });
  }

  load() {
    this.api.getUsers().subscribe({ next: (u) => this.users.set(u) });
  }

  toggleActive(user: any) {
    this.api.updateUser(user.id, { isActive: !user.isActive }).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Failed'),
    });
  }

  toggleRole(user: any) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    this.api.updateUser(user.id, { role: newRole }).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Failed'),
    });
  }

  toggleCloudEditor(user: any) {
    this.api.updateUser(user.id, { cloudEditorAllowed: !user.cloudEditorAllowed }).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Failed'),
    });
  }

  exportData(user: any) {
    const sendEmail = confirm(`Export all data for ${user.email}?\n\nClick OK to generate the export and send a download link via email.\nClick Cancel to just generate the download link (no email).`);
    this.exporting.set(true);
    this.api.exportUserData(user.id, sendEmail).subscribe({
      next: (result) => {
        this.exporting.set(false);
        if (result.emailSent) {
          alert(`Export ready. Download link sent to ${user.email}.\n\nAdmin download link (valid 24h):\n${result.downloadUrl}`);
        } else {
          alert(`Export ready (no email sent).\n\nDownload link (valid 24h):\n${result.downloadUrl}`);
        }
      },
      error: (err) => {
        this.exporting.set(false);
        alert(err.error?.error || 'Export failed');
      },
    });
  }

  deleteUser(user: any) {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    this.api.deleteUser(user.id).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Failed'),
    });
  }
}
