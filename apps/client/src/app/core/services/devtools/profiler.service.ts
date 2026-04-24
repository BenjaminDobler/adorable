import { Injectable, inject, signal } from '@angular/core';
import { CdpService } from './cdp.service';
import { ProfilerCycle } from './devtools.types';

@Injectable({
  providedIn: 'root',
})
export class ProfilerService {
  private cdp = inject(CdpService);

  profilerRecording = signal(false);
  profilerCycles = signal<ProfilerCycle[]>([]);

  async startProfiler(): Promise<void> {
    this.profilerCycles.set([]);
    try {
      await this.cdp.evaluate(`
        (function() {
          window.__adorable_profiler_data = [];
          window.__adorable_profiler_cycleId = 0;
          if (window.ng && window.ng.ɵsetProfiler) {
            window.ng.ɵsetProfiler(function(event, context) {
              if (event === 0) {
                window.__pStart = performance.now();
                window.__pName = context?.constructor?.name || '?';
              }
              if (event === 1) {
                var duration = performance.now() - window.__pStart;
                var data = window.__adorable_profiler_data;
                var last = data[data.length - 1];
                if (!last || performance.now() - last.timestamp > 16) {
                  window.__adorable_profiler_cycleId++;
                  data.push({ id: window.__adorable_profiler_cycleId, timestamp: performance.now(), duration: 0, components: [] });
                  last = data[data.length - 1];
                }
                last.duration += duration;
                var existing = last.components.find(function(c) { return c.name === window.__pName; });
                if (existing) existing.duration += duration;
                else last.components.push({ name: window.__pName, duration: duration });
              }
            });
          }
        })()
      `);
      this.profilerRecording.set(true);
    } catch (err) {
      console.error('[ProfilerService] startProfiler failed:', err);
    }
  }

  async stopProfiler(): Promise<void> {
    try {
      await this.cdp.evaluate(`
        if (window.ng && window.ng.ɵsetProfiler) {
          window.ng.ɵsetProfiler(null);
        }
      `);
    } catch { /* ignore */ }
    this.profilerRecording.set(false);
  }

  async pollProfilerData(): Promise<void> {
    try {
      const result = await this.cdp.evaluate(`
        (function() {
          var data = window.__adorable_profiler_data || [];
          return data.slice(-100);
        })()
      `);
      if (Array.isArray(result)) {
        this.profilerCycles.set(result as ProfilerCycle[]);
      }
    } catch { /* ignore */ }
  }

  exportProfileData(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      cycles: this.profilerCycles(),
    }, null, 2);
  }
}
