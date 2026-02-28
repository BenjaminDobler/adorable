import { Component, inject, signal, effect, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/api';
import { ProjectService } from '../services/project';
import { ToastService } from '../services/toast';
import { Subscription } from 'rxjs';
import {
  SessionLogEntry,
  SessionOverview,
  SessionSuggestion,
  SuggestionType,
} from '@adorable/shared-types';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-insights-panel',
  template: `
    <div class="insights-panel">
      @if (!selectedSession()) {
        <!-- Session List View -->
        <div class="insights-header">
          <h3>Insights</h3>
          <button class="btn-refresh" (click)="loadSessions()" [disabled]="loadingSessions()" title="Refresh">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        </div>

        @if (loadingSessions()) {
          <div class="insights-loading">
            <div class="spinner"></div>
            <span>Loading sessions...</span>
          </div>
        } @else if (sessions().length === 0) {
          <div class="insights-empty">
            <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            <p>No sessions found</p>
            <span>AI generation sessions will appear here after you generate code.</span>
          </div>
        } @else {
          <div class="session-list">
            @for (session of sessions(); track session.filename) {
              <div class="session-item" (click)="startAnalysis(session)">
                <div class="session-info">
                  <span class="session-prompt">{{ session.overview.promptSummary || 'No prompt' }}</span>
                  <div class="session-meta">
                    <span class="meta-tag">{{ session.overview.provider }}/{{ session.overview.model }}</span>
                    <span class="meta-sep">·</span>
                    <span>{{ session.overview.turns }} turns</span>
                    <span class="meta-sep">·</span>
                    <span>{{ session.overview.toolCallCount }} tools</span>
                  </div>
                  <span class="session-date">{{ formatDate(session.timestamp) }}</span>
                </div>
                <button class="btn-analyze" title="Analyze this session">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  Analyze
                </button>
              </div>
            }
          </div>
        }
      } @else {
        <!-- Analysis View -->
        <div class="insights-header">
          <button class="btn-back" (click)="goBack()" title="Back to sessions">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h3>Analysis</h3>
        </div>

        <div class="analysis-content">
          @if (currentOverview()) {
            <div class="overview-card">
              <div class="overview-row">
                <div class="overview-stat">
                  <span class="stat-value">{{ currentOverview()!.turns }}</span>
                  <span class="stat-label">Turns</span>
                </div>
                <div class="overview-stat">
                  <span class="stat-value">{{ currentOverview()!.toolCallCount }}</span>
                  <span class="stat-label">Tool Calls</span>
                </div>
                <div class="overview-stat">
                  <span class="stat-value success">{{ currentOverview()!.buildSuccesses }}</span>
                  <span class="stat-label">Builds OK</span>
                </div>
                <div class="overview-stat">
                  <span class="stat-value" [class.error]="currentOverview()!.buildFailures > 0">{{ currentOverview()!.buildFailures }}</span>
                  <span class="stat-label">Build Fail</span>
                </div>
                <div class="overview-stat">
                  <span class="stat-value" [class.error]="currentOverview()!.errorCount > 0">{{ currentOverview()!.errorCount }}</span>
                  <span class="stat-label">Errors</span>
                </div>
              </div>
            </div>
          }

          @if (analyzing()) {
            <div class="insights-loading">
              <div class="spinner"></div>
              <span>{{ analysisProgress() }}</span>
            </div>
          }

          @if (suggestions().length > 0) {
            <div class="filter-bar">
              <button class="filter-chip" [class.active]="activeFilter() === 'all'" (click)="activeFilter.set('all')">All</button>
              <button class="filter-chip" [class.active]="activeFilter() === 'kit_doc_improvement'" (click)="activeFilter.set('kit_doc_improvement')">Kit Docs</button>
              <button class="filter-chip" [class.active]="activeFilter() === 'system_prompt_improvement'" (click)="activeFilter.set('system_prompt_improvement')">Prompts</button>
              <button class="filter-chip" [class.active]="activeFilter() === 'workflow_recommendation'" (click)="activeFilter.set('workflow_recommendation')">Workflow</button>
              <button class="filter-chip" [class.active]="activeFilter() === 'project_structure'" (click)="activeFilter.set('project_structure')">Project</button>
            </div>

            <div class="suggestions-list">
              @for (sug of filteredSuggestions(); track sug.id) {
                <div class="suggestion-card" [class.applied]="sug.applied">
                  <div class="suggestion-header">
                    <span class="severity-badge" [class]="'severity-' + sug.severity">{{ sug.severity }}</span>
                    <span class="type-label">{{ formatType(sug.type) }}</span>
                  </div>
                  <div class="suggestion-title">{{ sug.title }}</div>
                  <div class="suggestion-desc">{{ sug.description }}</div>
                  <div class="suggestion-actions">
                    @if (sug.applied) {
                      <span class="applied-badge">
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Applied
                      </span>
                    } @else if (sug.patch) {
                      <button class="btn-apply" (click)="applySuggestion(sug)" [disabled]="applying()">Apply</button>
                    } @else {
                      <span class="advice-label">Advice</span>
                    }
                  </div>
                </div>
              }
            </div>
          }

          @if (!analyzing() && suggestions().length === 0 && currentOverview()) {
            <div class="insights-empty" style="padding-top: 2rem;">
              <p>No suggestions generated</p>
              <span>The AI found no improvements to suggest for this session.</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .insights-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .insights-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--panel-border);
      gap: 8px;

      h3 {
        margin: 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-primary);
        flex: 1;
      }
    }

    .btn-refresh, .btn-back {
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

    .insights-loading {
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

    .insights-empty {
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

    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .session-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--panel-border);
      cursor: pointer;

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--bg-surface-2);
      }
    }

    .session-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }

    .session-prompt {
      font-size: 0.8rem;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-meta {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.7rem;
      color: var(--text-secondary);
    }

    .meta-tag {
      background: var(--bg-surface-3);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.65rem;
    }

    .meta-sep {
      opacity: 0.5;
    }

    .session-date {
      font-size: 0.65rem;
      color: var(--text-muted);
    }

    .btn-analyze {
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
    }

    .analysis-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 0;
    }

    .overview-card {
      margin: 0 12px 12px;
      padding: 12px;
      background: var(--bg-surface-2);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-sm);
    }

    .overview-row {
      display: flex;
      justify-content: space-between;
      gap: 4px;
    }

    .overview-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex: 1;
    }

    .stat-value {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-primary);

      &.success {
        color: var(--accent-color);
      }

      &.error {
        color: var(--error-color, #ef4444);
      }
    }

    .stat-label {
      font-size: 0.6rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .filter-bar {
      display: flex;
      gap: 6px;
      padding: 0 12px 8px;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .filter-chip {
      background: var(--bg-surface-2);
      border: 1px solid var(--panel-border);
      color: var(--text-secondary);
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;

      &:hover {
        color: var(--text-primary);
        border-color: var(--text-muted);
      }

      &.active {
        background: var(--accent-color);
        border-color: var(--accent-color);
        color: #000;
      }
    }

    .suggestions-list {
      padding: 0 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .suggestion-card {
      padding: 12px;
      background: var(--bg-surface-2);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-sm);
      transition: all 0.2s;

      &.applied {
        opacity: 0.6;
      }
    }

    .suggestion-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .severity-badge {
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 10px;

      &.severity-high {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      &.severity-medium {
        background: rgba(234, 179, 8, 0.15);
        color: #eab308;
      }

      &.severity-low {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }
    }

    .type-label {
      font-size: 0.6rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .suggestion-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .suggestion-desc {
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin-bottom: 8px;
    }

    .suggestion-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-apply {
      background: var(--accent-color);
      border: none;
      color: #000;
      padding: 4px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        opacity: 0.9;
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }

    .applied-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.7rem;
      color: var(--accent-color);
      font-weight: 600;
    }

    .advice-label {
      font-size: 0.65rem;
      color: var(--text-muted);
      font-style: italic;
    }
  `]
})
export class InsightsPanelComponent implements OnDestroy {
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

    this.sub = this.apiService.listSessions(projectId).subscribe({
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
    this.sub = this.apiService.analyzeSession(session.filename, session.projectId, kitId).subscribe({
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
    this.apiService.applySuggestion(suggestion).subscribe({
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
