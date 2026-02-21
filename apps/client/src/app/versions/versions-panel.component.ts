import { Component, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/api';
import { ProjectService } from '../services/project';
import { ConfirmService } from '../services/confirm';
import { ToastService } from '../services/toast';
import { Subscription } from 'rxjs';

interface Commit {
  sha: string;
  message: string;
  date: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-versions-panel',
  template: `
    <div class="versions-panel">
      <div class="versions-header">
        <h3>Version History</h3>
        <button class="btn-refresh" (click)="loadHistory()" [disabled]="loading()" title="Refresh">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>

      @if (loading()) {
        <div class="versions-loading">
          <div class="spinner"></div>
          <span>Loading history...</span>
        </div>
      } @else if (error()) {
        <div class="versions-empty">
          <p>{{ error() }}</p>
        </div>
      } @else if (commits().length === 0) {
        <div class="versions-empty">
          <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <p>No versions yet</p>
          <span>Versions are created when you save or when the AI generates code.</span>
        </div>
      } @else {
        <div class="versions-list">
          @for (commit of commits(); track commit.sha) {
            <div class="version-item">
              <div class="version-info">
                <span class="version-message">{{ commit.message }}</span>
                <span class="version-date">{{ formatDate(commit.date) }}</span>
              </div>
              <button class="btn-restore" (click)="restore(commit.sha)" [disabled]="restoring()" title="Restore to this version">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
                Restore
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .versions-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .versions-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--panel-border);

      h3 {
        margin: 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-primary);
      }
    }

    .btn-refresh {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;

      &:hover {
        color: var(--text-primary);
        background: var(--bg-surface-2);
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }

    .versions-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 3rem 1rem;
      color: var(--text-secondary);
      font-size: 0.8rem;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--panel-border);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .versions-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 3rem 1.5rem;
      text-align: center;
      color: var(--text-secondary);

      p {
        margin: 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      span {
        font-size: 0.75rem;
        line-height: 1.4;
      }
    }

    .versions-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .version-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--panel-border);

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--bg-surface-2);
      }
    }

    .version-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }

    .version-message {
      font-size: 0.8rem;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .version-date {
      font-size: 0.7rem;
      color: var(--text-secondary);
    }

    .btn-restore {
      background: var(--bg-surface-2);
      border: 1px solid var(--panel-border);
      color: var(--text-secondary);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
      white-space: nowrap;
      flex-shrink: 0;

      &:hover {
        background: var(--bg-surface-3);
        color: var(--text-primary);
        border-color: var(--text-muted);
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }
  `]
})
export class VersionsPanelComponent implements OnDestroy {
  private apiService = inject(ApiService);
  private projectService = inject(ProjectService);
  private confirmService = inject(ConfirmService);
  private toastService = inject(ToastService);

  commits = signal<Commit[]>([]);
  loading = signal(false);
  restoring = signal(false);
  error = signal<string | null>(null);

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const id = this.projectService.projectId();
      if (id) {
        this.loadHistory();
      } else {
        this.commits.set([]);
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  loadHistory() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    this.loading.set(true);
    this.error.set(null);
    this.sub?.unsubscribe();

    this.sub = this.apiService.getProjectHistory(projectId).subscribe({
      next: (result) => {
        this.commits.set(result.commits);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[Versions] Failed to load history:', err);
        this.error.set('Failed to load version history');
        this.loading.set(false);
      }
    });
  }

  async restore(sha: string) {
    const projectId = this.projectService.projectId();
    if (!projectId || this.restoring()) return;

    const confirmed = await this.confirmService.confirm(
      'Are you sure you want to restore this version? Current unsaved changes might be lost.',
      'Restore',
      'Cancel'
    );
    if (!confirmed) return;

    this.restoring.set(true);
    try {
      const result = await this.apiService.restoreVersion(projectId, sha).toPromise();
      if (result?.files) {
        await this.projectService.reloadPreview(result.files);
        this.projectService.addSystemMessage('Restored project to previous version.');
        this.toastService.show('Version restored', 'info');
      }
    } catch (err) {
      console.error('[Versions] Restore failed:', err);
      this.toastService.show('Failed to restore version', 'error');
    } finally {
      this.restoring.set(false);
    }
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }
}
