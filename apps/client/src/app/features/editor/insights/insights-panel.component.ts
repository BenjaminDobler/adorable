import { Component, inject, signal, effect, computed, OnDestroy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../../core/services/api';
import { ProjectService } from '../../../core/services/project';
import { ToastService } from '../../../core/services/toast';
import { Subscription } from 'rxjs';
import {
  SessionLogEntry,
  SessionOverview,
  SessionSuggestion,
  SuggestionType,
} from '@adorable/shared-types';

@Component({
  standalone: true,
  imports: [],
  selector: 'app-insights-panel',
  templateUrl: './insights-panel.component.html',
  styleUrl: './insights-panel.component.scss'
})
export class InsightsPanelComponent implements OnDestroy {
  private destroyRef = inject(DestroyRef);
  private apiService = inject(ApiService);
  private projectService = inject(ProjectService);
  private toastService = inject(ToastService);

  sessions = signal<SessionLogEntry[]>([]);
  loadingSessions = signal(false);
  analyzing = signal(false);
  analysisProgress = signal('');
  currentOverview = signal<SessionOverview | null>(null);
  suggestions = signal<SessionSuggestion[]>([]);
  selectedSession = signal<SessionLogEntry | null>(null);
  activeFilter = signal<SuggestionType | 'all'>('all');
  applying = signal(false);

  filteredSuggestions = computed(() => {
    const filter = this.activeFilter();
    const all = this.suggestions();
    if (filter === 'all') return all;
    return all.filter(s => s.type === filter);
  });

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const id = this.projectService.projectId();
      if (id) {
        this.loadSessions();
      } else {
        this.sessions.set([]);
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  loadSessions() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    this.loadingSessions.set(true);
    this.sub?.unsubscribe();

    this.sub = this.apiService.listSessions(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.sessions.set(result.sessions);
        this.loadingSessions.set(false);
      },
      error: (err) => {
        console.error('[Insights] Failed to load sessions:', err);
        this.sessions.set([]);
        this.loadingSessions.set(false);
      }
    });
  }

  startAnalysis(session: SessionLogEntry) {
    this.selectedSession.set(session);
    this.analyzing.set(true);
    this.analysisProgress.set('Starting analysis...');
    this.currentOverview.set(null);
    this.suggestions.set([]);
    this.activeFilter.set('all');

    const kitId = this.projectService.selectedKitId() || undefined;

    this.sub?.unsubscribe();
    this.sub = this.apiService.analyzeSession(session.filename, session.projectId, kitId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (event) => {
        switch (event.type) {
          case 'progress':
            this.analysisProgress.set(event.message || '');
            break;
          case 'overview':
            if (event.overview) this.currentOverview.set(event.overview);
            break;
          case 'suggestion':
            if (event.suggestion) {
              this.suggestions.update(prev => [...prev, event.suggestion!]);
            }
            break;
          case 'complete':
            this.analyzing.set(false);
            break;
          case 'error':
            this.analyzing.set(false);
            this.toastService.show(event.error || 'Analysis failed', 'error');
            break;
        }
      },
      error: (err) => {
        console.error('[Insights] Analysis failed:', err);
        this.analyzing.set(false);
        this.toastService.show('Analysis failed', 'error');
      },
      complete: () => {
        this.analyzing.set(false);
      }
    });
  }

  applySuggestion(suggestion: SessionSuggestion) {
    this.applying.set(true);
    this.apiService.applySuggestion(suggestion).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        if (result.success) {
          this.suggestions.update(prev =>
            prev.map(s => s.id === suggestion.id ? { ...s, applied: true } : s)
          );
          this.toastService.show('Suggestion applied', 'success');
        } else {
          this.toastService.show(result.error || 'Failed to apply', 'error');
        }
        this.applying.set(false);
      },
      error: (err) => {
        console.error('[Insights] Apply failed:', err);
        this.toastService.show('Failed to apply suggestion', 'error');
        this.applying.set(false);
      }
    });
  }

  goBack() {
    this.selectedSession.set(null);
    this.currentOverview.set(null);
    this.suggestions.set([]);
    this.analyzing.set(false);
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ');
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
