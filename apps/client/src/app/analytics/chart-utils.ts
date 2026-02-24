/**
 * Pure Canvas 2D chart rendering utilities for the analytics dashboard.
 * Reads CSS custom properties for theming.
 */

function getCSSVar(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function hexToRgba(hex: string, alpha: number): string {
  // Handle CSS variable values that might be rgb/hex
  if (hex.startsWith('rgb')) return hex.replace(')', `, ${alpha})`).replace('rgb(', 'rgba(');
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface BarChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color: string;
  }[];
}

export function renderBarChart(canvas: HTMLCanvasElement, data: BarChartData): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  ctx.clearRect(0, 0, w, h);

  const textColor = getCSSVar('--text-muted') || '#888';
  const borderColor = getCSSVar('--panel-border') || '#333';

  // Find max value
  let maxVal = 0;
  for (const ds of data.datasets) {
    for (const v of ds.data) {
      if (v > maxVal) maxVal = v;
    }
  }
  if (maxVal === 0) maxVal = 1;

  // Draw grid lines
  const gridLines = 5;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 0.5;
  ctx.fillStyle = textColor;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + chartH - (i / gridLines) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();

    const val = (maxVal * i) / gridLines;
    const label = val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val >= 1000 ? (val / 1000).toFixed(0) + 'K' : val.toFixed(0);
    ctx.fillText(label, padding.left - 8, y + 3);
  }

  // Draw bars
  const numBars = data.labels.length;
  if (numBars === 0) return;

  const numDatasets = data.datasets.length;
  const groupWidth = chartW / numBars;
  const barWidth = Math.min((groupWidth * 0.7) / numDatasets, 30);
  const groupPadding = (groupWidth - barWidth * numDatasets) / 2;

  for (let di = 0; di < numDatasets; di++) {
    const ds = data.datasets[di];
    ctx.fillStyle = ds.color;

    for (let i = 0; i < numBars; i++) {
      const val = ds.data[i] || 0;
      const barH = (val / maxVal) * chartH;
      const x = padding.left + i * groupWidth + groupPadding + di * barWidth;
      const y = padding.top + chartH - barH;

      ctx.beginPath();
      const radius = Math.min(3, barWidth / 2);
      ctx.moveTo(x, y + radius);
      ctx.arcTo(x, y, x + barWidth, y, radius);
      ctx.arcTo(x + barWidth, y, x + barWidth, y + barH, radius);
      ctx.lineTo(x + barWidth, padding.top + chartH);
      ctx.lineTo(x, padding.top + chartH);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw x-axis labels
  ctx.fillStyle = textColor;
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';

  const labelStep = Math.ceil(numBars / 12); // Show at most ~12 labels
  for (let i = 0; i < numBars; i += labelStep) {
    const x = padding.left + i * groupWidth + groupWidth / 2;
    const label = data.labels[i];
    // Show only month-day
    const shortLabel = label.length > 5 ? label.substring(5) : label;
    ctx.fillText(shortLabel, x, padding.top + chartH + 16);
  }
}

export interface DonutChartData {
  labels: string[];
  values: number[];
  colors: string[];
}

export function renderDonutChart(canvas: HTMLCanvasElement, data: DonutChartData): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  const total = data.values.reduce((a, b) => a + b, 0);
  if (total === 0) return;

  const cx = w * 0.3;
  const cy = h / 2;
  const outerR = Math.min(cx - 10, cy - 10);
  const innerR = outerR * 0.6;

  let startAngle = -Math.PI / 2;

  for (let i = 0; i < data.values.length; i++) {
    const sliceAngle = (data.values[i] / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = data.colors[i % data.colors.length];
    ctx.fill();
    startAngle += sliceAngle;
  }

  // Legend on the right
  const textColor = getCSSVar('--text-secondary') || '#aaa';
  const mutedColor = getCSSVar('--text-muted') || '#666';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';

  const legendX = w * 0.55;
  const lineHeight = 22;
  const legendStartY = Math.max(10, cy - (data.labels.length * lineHeight) / 2);

  for (let i = 0; i < data.labels.length; i++) {
    const y = legendStartY + i * lineHeight;
    // Color dot
    ctx.fillStyle = data.colors[i % data.colors.length];
    ctx.beginPath();
    ctx.arc(legendX, y + 5, 5, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = textColor;
    const pct = ((data.values[i] / total) * 100).toFixed(1);
    const shortName = data.labels[i].length > 20 ? data.labels[i].substring(0, 20) + '...' : data.labels[i];
    ctx.fillText(`${shortName}`, legendX + 14, y + 9);

    // Percentage
    ctx.fillStyle = mutedColor;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(`${pct}%`, legendX + 14, y + 20);
    ctx.font = '11px "JetBrains Mono", monospace';
  }
}

export const CHART_COLORS = [
  '#3ecf8e',  // accent green
  '#6366f1',  // indigo
  '#f59e0b',  // amber
  '#ef4444',  // red
  '#8b5cf6',  // violet
  '#06b6d4',  // cyan
  '#ec4899',  // pink
  '#14b8a6',  // teal
];
