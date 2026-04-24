import { Component, inject } from '@angular/core';
import { DevtoolsService, ProfilerCycle } from '../../../../core/services/devtools.service';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';

@Component({
  standalone: true,
  imports: [IconComponent],
  selector: 'app-performance-tab',
  templateUrl: './performance-tab.component.html',
  styleUrl: './performance-tab.component.scss',
})
export class PerformanceTabComponent {
  devtools = inject(DevtoolsService);

  private profilerPollInterval: ReturnType<typeof setInterval> | null = null;

  toggleProfiler(): void {
    if (this.devtools.profilerRecording()) {
      this.stopProfiler();
    } else {
      this.startProfiler();
    }
  }

  private startProfiler(): void {
    this.devtools.startProfiler();
    this.profilerPollInterval = setInterval(() => {
      this.devtools.pollProfilerData();
    }, 1000);
  }

  private stopProfiler(): void {
    if (this.profilerPollInterval) {
      clearInterval(this.profilerPollInterval);
      this.profilerPollInterval = null;
    }
    this.devtools.stopProfiler();
  }

  exportProfile(): void {
    const json = this.devtools.exportProfileData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adorable-profile-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  maxCycleDuration(): number {
    const cycles = this.devtools.profilerCycles();
    if (cycles.length === 0) return 1;
    return Math.max(...cycles.map((c) => c.duration), 1);
  }

  formatDuration(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  cycleBarWidth(cycle: ProfilerCycle): number {
    return Math.max((cycle.duration / this.maxCycleDuration()) * 100, 2);
  }

  cycleBarColor(cycle: ProfilerCycle): string {
    if (cycle.duration > 16) return '#ef4444';
    if (cycle.duration > 8) return '#eab308';
    return 'var(--accent-color)';
  }
}
