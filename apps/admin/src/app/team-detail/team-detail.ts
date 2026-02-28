import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="team-detail">
      @if (team(); as t) {
        <div class="header">
          <button class="btn-back" (click)="goBack()">&larr; Teams</button>
          <h2>{{ t.name }}</h2>
          <span class="slug"><code>{{ t.slug }}</code></span>
          <span class="created">Created {{ t.createdAt | date:'mediumDate' }}</span>
        </div>

        <div class="stats-row">
          <div class="stat-badge">{{ t.members?.length || 0 }} members</div>
          <div class="stat-badge">{{ t.projectCount }} projects</div>
          <div class="stat-badge">{{ t.kitCount }} kits</div>
        </div>

        <h3>Members</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            @for (member of t.members; track member.id) {
              <tr>
                <td>{{ member.user?.name || '—' }}</td>
                <td>{{ member.user?.email }}</td>
                <td>
                  <span class="badge" [class.owner]="member.role === 'owner'" [class.admin]="member.role === 'admin'">{{ member.role }}</span>
                </td>
                <td>{{ member.joinedAt | date:'shortDate' }}</td>
              </tr>
            }
          </tbody>
        </table>

        @if (t.invites?.length) {
          <h3>Invites</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              @for (invite of t.invites; track invite.id) {
                <tr>
                  <td><code>{{ invite.code }}</code></td>
                  <td>{{ invite.email || '—' }}</td>
                  <td><span class="badge">{{ invite.role }}</span></td>
                  <td>
                    <span class="badge" [class.used]="invite.usedBy" [class.expired]="isExpired(invite)">
                      {{ invite.usedBy ? 'Used' : isExpired(invite) ? 'Expired' : 'Available' }}
                    </span>
                  </td>
                  <td>{{ invite.createdAt | date:'shortDate' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }

        <div class="danger-zone">
          <h3>Danger Zone</h3>
          <p>Deleting this team will unassign all projects and kits. Members will lose access.</p>
          <button class="btn-danger" (click)="deleteTeam()">Delete Team</button>
        </div>
      } @else {
        <div class="loading">Loading...</div>
      }
    </div>
  `,
  styles: [`
    .team-detail { padding: 0; }
    .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    h2 { margin: 0; font-weight: 700; }
    h3 { margin: 2rem 0 1rem; font-weight: 600; font-size: 1rem; }
    .btn-back {
      background: #2e2e3e;
      border: 1px solid #3e3e4e;
      color: #ccc;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .btn-back:hover { background: #3e3e4e; }
    .slug code { background: #2e2e3e; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    .created { color: #888; font-size: 0.8rem; }
    .stats-row { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
    .stat-badge {
      background: #1e1e2e;
      border: 1px solid #2e2e3e;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 0.85rem;
      color: #ccc;
    }
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
    code { background: #2e2e3e; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    .badge {
      background: #2e2e3e;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    .badge.owner { background: #3b82f6; color: #fff; }
    .badge.admin { background: #8b5cf6; color: #fff; }
    .badge.used { background: #2e2e3e; color: #888; }
    .badge.expired { background: #3a1a1a; color: #ef4444; }
    .danger-zone {
      margin-top: 3rem;
      padding: 1.5rem;
      border: 1px solid #3a1a1a;
      border-radius: 8px;
      background: #1a1a1a;
    }
    .danger-zone h3 { margin: 0 0 0.5rem; color: #ef4444; }
    .danger-zone p { color: #888; font-size: 0.85rem; margin: 0 0 1rem; }
    .btn-danger {
      background: #ef4444;
      border: none;
      color: #fff;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .btn-danger:hover { background: #dc2626; }
    .loading { color: #888; padding: 2rem; text-align: center; }
  `],
})
export class TeamDetailComponent implements OnInit {
  private api = inject(AdminApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  team = signal<any>(null);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getTeam(id).subscribe({
      next: (t) => this.team.set(t),
      error: () => this.router.navigate(['/teams']),
    });
  }

  goBack() {
    this.router.navigate(['/teams']);
  }

  isExpired(invite: any): boolean {
    if (!invite.expiresAt) return false;
    return new Date(invite.expiresAt) < new Date();
  }

  deleteTeam() {
    const t = this.team();
    if (!t) return;
    if (!confirm(`Delete team "${t.name}"? Projects and kits will be unassigned.`)) return;
    this.api.deleteTeam(t.id).subscribe({
      next: () => this.router.navigate(['/teams']),
      error: (err) => alert(err.error?.error || 'Failed'),
    });
  }
}
