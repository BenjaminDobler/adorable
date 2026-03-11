import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-global-kits',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="global-kits-page">
      <div class="page-header">
        <h2>Global Kits</h2>
        <a class="btn-create" href="/kit-builder/new?global=true" target="_blank">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Global Kit
        </a>
      </div>

      @if (loading()) {
        <p class="loading-text">Loading...</p>
      } @else if (kits().length === 0) {
        <div class="empty-state">
          <p>No global kits yet. Create one to make it available to all users.</p>
        </div>
      } @else {
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (kit of kits(); track kit.id) {
              <tr>
                <td class="kit-name">{{ kit.name }}</td>
                <td class="kit-desc">{{ kit.description || '—' }}</td>
                <td>
                  @if (kit.deprecated) {
                    <span class="badge deprecated">Deprecated</span>
                  } @else {
                    <span class="badge active">Active</span>
                  }
                </td>
                <td>{{ kit.createdAt | date:'mediumDate' }}</td>
                <td class="actions">
                  <a class="btn-sm" [href]="'/kit-builder/' + kit.id + '?global=true'" target="_blank">Edit</a>
                  @if (kit.deprecated) {
                    <button class="btn-sm btn-restore" (click)="undeprecate(kit.id)">Restore</button>
                  } @else {
                    <button class="btn-sm btn-warn" (click)="deprecate(kit.id)">Deprecate</button>
                  }
                  <button class="btn-sm btn-danger" (click)="deleteKit(kit.id)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: [`
    .global-kits-page { padding: 0; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .page-header h2 { margin: 0; }
    .btn-create {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .btn-create:hover { opacity: 0.9; }
    .loading-text { color: var(--text-secondary); }
    .empty-state { color: var(--text-secondary); text-align: center; padding: 3rem 0; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.active { background: rgba(52, 211, 153, 0.15); color: #34d399; }
    .badge.deprecated { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
    .actions { display: flex; gap: 0.5rem; }
    .btn-sm {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--panel-border);
      border-radius: 4px;
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 0.75rem;
      text-decoration: none;
    }
    .btn-sm:hover { background: var(--panel-bg-hover); }
    .btn-warn { color: #fbbf24; border-color: rgba(251, 191, 36, 0.3); }
    .btn-warn:hover { background: rgba(251, 191, 36, 0.1); }
    .btn-restore { color: #34d399; border-color: rgba(52, 211, 153, 0.3); }
    .btn-restore:hover { background: rgba(52, 211, 153, 0.1); }
    .btn-danger { color: #f87171; border-color: rgba(248, 113, 113, 0.3); }
    .btn-danger:hover { background: rgba(248, 113, 113, 0.1); }
    .kit-name { font-weight: 500; }
    .kit-desc { color: var(--text-secondary); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `]
})
export class GlobalKitsComponent implements OnInit {
  private api = inject(AdminApiService);

  kits = signal<any[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.loadKits();
  }

  loadKits() {
    this.loading.set(true);
    this.api.getGlobalKits().subscribe({
      next: (kits) => {
        this.kits.set(kits);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  deprecate(id: string) {
    this.api.deprecateGlobalKit(id).subscribe({
      next: () => this.loadKits(),
      error: () => console.error('Failed to deprecate kit')
    });
  }

  undeprecate(id: string) {
    this.api.undeprecateGlobalKit(id).subscribe({
      next: () => this.loadKits(),
      error: () => console.error('Failed to undeprecate kit')
    });
  }

  deleteKit(id: string) {
    if (!confirm('Are you sure you want to delete this global kit?')) return;
    this.api.deleteGlobalKit(id).subscribe({
      next: () => this.loadKits(),
      error: () => console.error('Failed to delete kit')
    });
  }
}
