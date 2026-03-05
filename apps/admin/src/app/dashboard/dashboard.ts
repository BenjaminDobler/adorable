import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from '../services/admin-api';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard">
      <h2>Dashboard</h2>

      <div class="server-status-card">
        <div class="server-status-header">
          <span class="status-dot" [class.ok]="serverStatus() === 'ok'" [class.down]="serverStatus() === 'down'"></span>
          <span class="server-status-title">Server</span>
          <span class="server-status-badge" [class.ok]="serverStatus() === 'ok'" [class.down]="serverStatus() === 'down'">
            {{ serverStatus() === 'ok' ? 'Healthy' : serverStatus() === 'down' ? 'Unreachable' : 'Checking...' }}
          </span>
        </div>
        @if (serverStatus() === 'ok') {
          <div class="server-status-detail">
            <span>Process uptime: <strong>{{ formatUptime(serverUptime()) }}</strong></span>
          </div>
        }
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ stats()?.users ?? '—' }}</div>
          <div class="stat-label">Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats()?.projects ?? '—' }}</div>
          <div class="stat-label">Projects</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats()?.teams ?? '—' }}</div>
          <div class="stat-label">Teams</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats()?.containers?.active ?? '—' }} / {{ stats()?.containers?.max ?? '—' }}</div>
          <div class="stat-label">Active Containers</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats()?.system?.usedMemPercent ?? '—' }}%</div>
          <div class="stat-label">Memory Usage</div>
        </div>
      </div>

      <div class="stats-grid secondary">
        <div class="stat-card">
          <div class="stat-value">{{ stats()?.system?.cpuCount ?? '—' }}</div>
          <div class="stat-label">CPU Cores</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatMem(stats()?.system?.freeMemMB) }} / {{ formatMem(stats()?.system?.totalMemMB) }}</div>
          <div class="stat-label">Memory (Free / Total)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats()?.system?.loadAvg?.toFixed(2) ?? '—' }}</div>
          <div class="stat-label">Load Average (1m)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatUptime(stats()?.system?.uptimeSeconds) }}</div>
          <div class="stat-label">System Uptime</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard { padding: 0; }
    h2 { margin: 0 0 1.5rem; font-weight: 700; }

    .server-status-card {
      background: #1e1e2e;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
    }
    .server-status-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #555;
      flex-shrink: 0;
    }
    .status-dot.ok { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
    .status-dot.down { background: #ef4444; box-shadow: 0 0 6px #ef444488; }
    .server-status-title {
      font-weight: 700;
      font-size: 0.95rem;
      color: #e0e0e0;
    }
    .server-status-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.15rem 0.55rem;
      border-radius: 4px;
      background: #2e2e3e;
      color: #888;
    }
    .server-status-badge.ok { background: #22c55e22; color: #22c55e; }
    .server-status-badge.down { background: #ef444422; color: #ef4444; }
    .server-status-detail {
      margin-top: 0.5rem;
      font-size: 0.8rem;
      color: #888;
    }
    .server-status-detail strong { color: #ccc; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .stat-card {
      background: #1e1e2e;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      padding: 1.25rem;
    }
    .stat-value { font-size: 1.75rem; font-weight: 800; color: #e0e0e0; }
    .stat-label { font-size: 0.8rem; color: #888; margin-top: 0.25rem; }
    .secondary .stat-value { font-size: 1.25rem; }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(AdminApiService);
  stats = signal<any>(null);
  serverStatus = signal<'ok' | 'down' | 'checking'>('checking');
  serverUptime = signal<number | undefined>(undefined);
  private interval: any;

  ngOnInit() {
    this.load();
    this.interval = setInterval(() => this.load(), 30000);
  }

  ngOnDestroy() {
    clearInterval(this.interval);
  }

  load() {
    this.api.getStats().subscribe({
      next: (s) => this.stats.set(s),
      error: () => {},
    });
    this.api.getHealth().subscribe({
      next: (h) => {
        this.serverStatus.set(h.status === 'ok' ? 'ok' : 'down');
        this.serverUptime.set(h.uptime);
      },
      error: () => {
        this.serverStatus.set('down');
        this.serverUptime.set(undefined);
      },
    });
  }

  formatMem(mb?: number): string {
    if (mb == null) return '—';
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb + ' MB';
  }

  formatUptime(seconds?: number): string {
    if (seconds == null) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
}
