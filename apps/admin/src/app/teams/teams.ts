import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="teams-page">
      <h2>Teams</h2>

      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Owner</th>
            <th>Members</th>
            <th>Projects</th>
            <th>Kits</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (team of teams(); track team.id) {
            <tr class="clickable" (click)="viewTeam(team)">
              <td>{{ team.name }}</td>
              <td><code>{{ team.slug }}</code></td>
              <td>{{ team.owner?.email || '—' }}</td>
              <td>{{ team.memberCount }}</td>
              <td>{{ team.projectCount }}</td>
              <td>{{ team.kitCount }}</td>
              <td>{{ team.createdAt | date:'shortDate' }}</td>
              <td class="actions" (click)="$event.stopPropagation()">
                <button class="btn-small" (click)="viewTeam(team)">View</button>
                <button class="btn-small danger" (click)="deleteTeam(team)">Delete</button>
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (teams().length === 0) {
        <div class="empty">No teams yet.</div>
      }
    </div>
  `,
  styles: [`
    .teams-page { padding: 0; }
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
    .clickable { cursor: pointer; }
    .clickable:hover { background: #1e1e2e; }
    code { background: #2e2e3e; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
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
    .empty { color: #888; padding: 2rem; text-align: center; }
  `],
})
export class TeamsComponent implements OnInit {
  private api = inject(AdminApiService);
  private router = inject(Router);
  teams = signal<any[]>([]);

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getTeams().subscribe({ next: (t) => this.teams.set(t) });
  }

  viewTeam(team: any) {
    this.router.navigate(['/teams', team.id]);
  }

  deleteTeam(team: any) {
    if (!confirm(`Delete team "${team.name}"? Projects and kits will be unassigned.`)) return;
    this.api.deleteTeam(team.id).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Failed'),
    });
  }
}
