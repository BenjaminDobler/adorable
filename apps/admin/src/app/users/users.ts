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
              <td>{{ user.projectCount }}</td>
              <td>{{ user.createdAt | date:'shortDate' }}</td>
              <td class="actions">
                <button class="btn-small" (click)="toggleActive(user)" [title]="user.isActive ? 'Disable' : 'Enable'">
                  {{ user.isActive ? 'Disable' : 'Enable' }}
                </button>
                <button class="btn-small" (click)="toggleRole(user)" [title]="user.role === 'admin' ? 'Demote' : 'Promote'">
                  {{ user.role === 'admin' ? 'Demote' : 'Promote' }}
                </button>
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
      border-bottom: 1px solid #2e2e3e;
    }
    .data-table th { color: #888; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
    tr.disabled { opacity: 0.5; }
    .badge {
      background: #2e2e3e;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    .badge.admin { background: #3b82f6; color: #fff; }
    .status-dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #ef4444;
      margin-right: 4px;
    }
    .status-dot.active { background: #22c55e; }
    .actions { display: flex; gap: 0.5rem; }
    .btn-small {
      background: #2e2e3e;
      border: 1px solid #3e3e4e;
      color: #ccc;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
    }
    .btn-small:hover { background: #3e3e4e; }
    .btn-small.danger { color: #ef4444; }
    .btn-small.danger:hover { background: #3a1a1a; }
  `],
})
export class UsersComponent implements OnInit {
  private api = inject(AdminApiService);
  users = signal<any[]>([]);

  ngOnInit() {
    this.load();
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

  deleteUser(user: any) {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    this.api.deleteUser(user.id).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Failed'),
    });
  }
}
