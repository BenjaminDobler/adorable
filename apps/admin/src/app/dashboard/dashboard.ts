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
