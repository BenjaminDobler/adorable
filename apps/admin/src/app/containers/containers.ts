import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-containers',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="containers-page">
      <div class="page-header">
        <h2>Docker Containers</h2>
        <button class="btn-refresh" (click)="load()">Refresh</button>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{{ containers().length }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat-card">
          <span class="stat-value running">{{ runningCount() }}</span>
          <span class="stat-label">Running</span>
        </div>
        <div class="stat-card">
          <span class="stat-value paused">{{ pausedCount() }}</span>
          <span class="stat-label">Paused</span>
        </div>
        <div class="stat-card">
          <span class="stat-value stopped">{{ stoppedCount() }}</span>
          <span class="stat-label">Stopped</span>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Project ID</th>
            <th>Container ID</th>
            <th>Status</th>
            <th>Ports</th>
            <th>Started</th>
            <th>Last Activity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (c of containers(); track c.userId) {
            <tr>
              <td>{{ c.user?.email || 'unknown' }}</td>
              <td><code>{{ c.projectId || '—' }}</code></td>
              <td><code>{{ c.inspect?.id || '—' }}</code></td>
              <td>
                <span class="badge" [class]="statusClass(c)">{{ statusLabel(c) }}</span>
              </td>
              <td>{{ formatPorts(c.inspect?.ports) }}</td>
              <td>{{ formatTime(c.inspect?.startedAt) }}</td>
              <td>{{ formatTime(c.lastActivity) }}</td>
              <td class="actions">
                @if (c.inspect?.status === 'paused') {
                  <button class="btn-small" (click)="unpause(c)">Unpause</button>
                } @else if (c.inspect?.status === 'running') {
                  <button class="btn-small" (click)="pause(c)">Pause</button>
                }
                <button class="btn-small danger" (click)="stop(c)">Stop</button>
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (containers().length === 0) {
        <div class="empty">No managed containers.</div>
      }
    </div>
  `,
  styles: [`
    .containers-page { padding: 0; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    h2 { margin: 0; font-weight: 700; }
    .btn-refresh {
      background: var(--bg-surface-3);
      border: 1px solid var(--panel-border-hover);
      color: var(--text-secondary);
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.2s var(--ease-out-expo);
    }
    .btn-refresh:hover { background: var(--bg-surface-4); color: var(--text-primary); }
    .stats-row { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card {
      background: var(--bg-surface-1);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-lg);
      padding: 1rem 1.5rem;
      display: flex;
      flex-direction: column;
      min-width: 100px;
      transition: all 0.25s var(--ease-out-expo);
    }
    .stat-card:hover { border-color: var(--panel-border-hover); box-shadow: var(--shadow-md); }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
    .stat-value.running { color: var(--success-color); }
    .stat-value.paused { color: var(--warning-color); }
    .stat-value.stopped { color: var(--error-color); }
    .stat-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
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
    code { background: var(--bg-surface-3); padding: 2px 6px; border-radius: var(--radius-xs); font-size: 0.8rem; }
    .badge {
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge.running { background: rgba(52, 211, 153, 0.12); color: var(--success-color); }
    .badge.paused { background: rgba(251, 191, 36, 0.12); color: var(--warning-color); }
    .badge.exited, .badge.stopped { background: rgba(248, 113, 113, 0.12); color: var(--error-color); }
    .badge.unknown { background: var(--bg-surface-3); color: var(--text-secondary); }
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
    .btn-small.danger { color: var(--error-color); }
    .btn-small.danger:hover { background: rgba(248, 113, 113, 0.1); }
    .empty { color: var(--text-secondary); padding: 2rem; text-align: center; }
  `],
})
export class ContainersComponent implements OnInit, OnDestroy {
  private api = inject(AdminApiService);
  containers = signal<any[]>([]);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.load();
    this.refreshInterval = setInterval(() => this.load(), 10000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  load() {
    this.api.getContainers().subscribe({ next: (c) => this.containers.set(c) });
  }

  runningCount() {
    return this.containers().filter(c => c.inspect?.status === 'running').length;
  }

  pausedCount() {
    return this.containers().filter(c => c.inspect?.status === 'paused').length;
  }

  stoppedCount() {
    return this.containers().filter(c => !c.inspect || c.inspect.status === 'exited' || c.inspect.status === 'dead').length;
  }

  statusClass(c: any): string {
    const s = c.inspect?.status;
    if (s === 'running') return 'running';
    if (s === 'paused') return 'paused';
    if (s === 'exited' || s === 'dead') return 'exited';
    return 'unknown';
  }

  statusLabel(c: any): string {
    return c.inspect?.status || (c.running ? 'managed' : 'no container');
  }

  formatPorts(ports: any): string {
    if (!ports) return '—';
    const mapped: string[] = [];
    for (const [containerPort, bindings] of Object.entries(ports)) {
      if (bindings && Array.isArray(bindings)) {
        for (const b of bindings as any[]) {
          mapped.push(`${b.HostPort} → ${containerPort}`);
        }
      }
    }
    return mapped.length ? mapped.join(', ') : '—';
  }

  formatTime(value: any): string {
    if (!value) return '—';
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    if (isNaN(date.getTime())) return '—';
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  pause(c: any) {
    this.api.pauseContainer(c.userId).subscribe({ next: () => this.load() });
  }

  unpause(c: any) {
    this.api.unpauseContainer(c.userId).subscribe({ next: () => this.load() });
  }

  stop(c: any) {
    if (!confirm(`Stop and remove container for ${c.user?.email || c.userId}?`)) return;
    this.api.stopContainer(c.userId).subscribe({ next: () => this.load() });
  }
}
