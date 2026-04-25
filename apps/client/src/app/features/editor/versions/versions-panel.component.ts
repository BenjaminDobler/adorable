import { Component, inject, signal, effect, OnDestroy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../../core/services/api';
import { ProjectService } from '../../../core/services/project';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Subscription, firstValueFrom } from 'rxjs';

interface Commit {
  sha: string;
  message: string;
  date: string;
}

@Component({
  standalone: true,
  imports: [],
  selector: 'app-versions-panel',
  templateUrl: './versions-panel.component.html',
  styleUrl: './versions-panel.component.scss'
})
export class VersionsPanelComponent implements OnDestroy {
  private destroyRef = inject(DestroyRef);
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
    // Load history when project changes
    effect(() => {
      const id = this.projectService.projectId();
      if (id) {
        this.loadHistory();
      } else {
        this.commits.set([]);
      }
    });

    // Auto-refresh when a new version is saved
    effect(() => {
      const v = this.projectService.saveVersion();
      if (v > 0 && this.projectService.projectId()) {
        this.loadHistory();
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

    this.sub = this.apiService.getProjectHistory(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
      const result = await firstValueFrom(this.apiService.restoreVersion(projectId, sha));
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
