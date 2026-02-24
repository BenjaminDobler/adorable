import { Component, inject, signal, effect, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../services/api';
import { ThemeService } from '../services/theme';
import { renderBarChart, renderDonutChart, CHART_COLORS } from './chart-utils';

interface PricingRow {
  model: string;
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
  cacheCreationCostPer1M: number | null;
  cacheReadCostPer1M: number | null;
  isCustom: boolean;
  defaults: {
    inputCostPer1M: number;
    outputCostPer1M: number;
    cacheCreationCostPer1M: number;
    cacheReadCostPer1M: number;
  };
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './analytics.html',
  styleUrls: ['./analytics.scss']
})
export class AnalyticsComponent implements AfterViewInit {
  private api = inject(ApiService);
  private themeService = inject(ThemeService);

  @ViewChild('barChartCanvas') barChartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('donutChartCanvas') donutChartCanvas?: ElementRef<HTMLCanvasElement>;

  selectedRange = signal('30d');
  loading = signal(false);
  data = signal<any>(null);

  // Pricing configuration
  pricingExpanded = signal(false);
  pricingRows = signal<PricingRow[]>([]);
  pricingSaving = signal(false);
  pricingDirty = signal(false);

  ranges = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: 'all', label: 'All time' },
  ];

  private viewReady = false;

  constructor() {
    // Re-render charts when theme changes
    effect(() => {
      this.themeService.resolvedMode();
      if (this.data() && this.viewReady) {
        setTimeout(() => this.renderCharts(), 50);
      }
    });
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.loadData();
  }

  setRange(range: string) {
    this.selectedRange.set(range);
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.api.getUsageAnalytics(this.selectedRange()).subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
        setTimeout(() => this.renderCharts(), 50);
      },
      error: (err) => {
        console.error('[Analytics] Failed to load:', err);
        this.loading.set(false);
      }
    });
  }

  togglePricing() {
    const expanding = !this.pricingExpanded();
    this.pricingExpanded.set(expanding);
    if (expanding && this.pricingRows().length === 0) {
      this.loadPricing();
    }
  }

  loadPricing() {
    this.api.getPricing().subscribe({
      next: ({ defaults, custom }) => {
        const rows: PricingRow[] = Object.entries(defaults).map(([model, def]: [string, any]) => {
          const cust = custom[model];
          return {
            model,
            inputCostPer1M: cust?.inputCostPer1M ?? null,
            outputCostPer1M: cust?.outputCostPer1M ?? null,
            cacheCreationCostPer1M: cust?.cacheCreationCostPer1M ?? null,
            cacheReadCostPer1M: cust?.cacheReadCostPer1M ?? null,
            isCustom: !!cust,
            defaults: {
              inputCostPer1M: def.inputCostPer1M,
              outputCostPer1M: def.outputCostPer1M,
              cacheCreationCostPer1M: def.cacheCreationCostPer1M ?? 0,
              cacheReadCostPer1M: def.cacheReadCostPer1M ?? 0,
            },
          };
        });
        this.pricingRows.set(rows);
        this.pricingDirty.set(false);
      },
      error: (err) => console.error('[Analytics] Failed to load pricing:', err),
    });
  }

  onPricingInput(row: PricingRow, field: keyof Pick<PricingRow, 'inputCostPer1M' | 'outputCostPer1M' | 'cacheCreationCostPer1M' | 'cacheReadCostPer1M'>, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const num = value === '' ? null : parseFloat(value);
    row[field] = isNaN(num as number) ? null : num;
    row.isCustom = row.inputCostPer1M !== null || row.outputCostPer1M !== null ||
                   row.cacheCreationCostPer1M !== null || row.cacheReadCostPer1M !== null;
    this.pricingDirty.set(true);
  }

  resetRow(row: PricingRow) {
    row.inputCostPer1M = null;
    row.outputCostPer1M = null;
    row.cacheCreationCostPer1M = null;
    row.cacheReadCostPer1M = null;
    row.isCustom = false;
    this.pricingDirty.set(true);
  }

  resetAllPricing() {
    this.pricingRows.update(rows => rows.map(r => ({
      ...r,
      inputCostPer1M: null,
      outputCostPer1M: null,
      cacheCreationCostPer1M: null,
      cacheReadCostPer1M: null,
      isCustom: false,
    })));
    this.pricingDirty.set(true);
  }

  savePricing() {
    const customPricing: Record<string, any> = {};
    for (const row of this.pricingRows()) {
      if (row.isCustom) {
        customPricing[row.model] = {
          inputCostPer1M: row.inputCostPer1M ?? row.defaults.inputCostPer1M,
          outputCostPer1M: row.outputCostPer1M ?? row.defaults.outputCostPer1M,
          cacheCreationCostPer1M: row.cacheCreationCostPer1M ?? row.defaults.cacheCreationCostPer1M,
          cacheReadCostPer1M: row.cacheReadCostPer1M ?? row.defaults.cacheReadCostPer1M,
        };
      }
    }

    this.pricingSaving.set(true);

    // Read current settings, merge customPricing, save
    this.api.getSettings().subscribe({
      next: (settings) => {
        const updated = { ...settings, customPricing };
        this.api.updateProfile({ settings: updated }).subscribe({
          next: () => {
            this.pricingSaving.set(false);
            this.pricingDirty.set(false);
            // Reload analytics to reflect new pricing
            this.loadData();
          },
          error: (err) => {
            console.error('[Analytics] Failed to save pricing:', err);
            this.pricingSaving.set(false);
          }
        });
      },
      error: (err) => {
        console.error('[Analytics] Failed to read settings:', err);
        this.pricingSaving.set(false);
      }
    });
  }

  private renderCharts() {
    if (!this.data()) return;

    // Bar chart - daily usage
    if (this.barChartCanvas?.nativeElement && this.data().byDay.length > 0) {
      renderBarChart(this.barChartCanvas.nativeElement, {
        labels: this.data().byDay.map((d: any) => d.date),
        datasets: [
          {
            label: 'Input Tokens',
            data: this.data().byDay.map((d: any) => d.inputTokens),
            color: CHART_COLORS[0],
          },
          {
            label: 'Output Tokens',
            data: this.data().byDay.map((d: any) => d.outputTokens),
            color: CHART_COLORS[1],
          },
        ]
      });
    }

    // Donut chart - by model cost
    if (this.donutChartCanvas?.nativeElement && this.data().byModel.length > 0) {
      renderDonutChart(this.donutChartCanvas.nativeElement, {
        labels: this.data().byModel.map((m: any) => m.model),
        values: this.data().byModel.map((m: any) => m.cost),
        colors: CHART_COLORS,
      });
    }
  }

  formatNumber(num: number): string {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
  }
}
