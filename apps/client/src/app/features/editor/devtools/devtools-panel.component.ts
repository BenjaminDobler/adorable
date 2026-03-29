import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DevtoolsService,
  ComponentTreeNode,
  PropertyInfo,
  ProfilerCycle,
  SignalNode,
} from '../../../core/services/devtools.service';
import { ElementFingerprint } from '../services/template';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-devtools-panel',
  templateUrl: './devtools-panel.component.html',
  styleUrl: './devtools-panel.component.scss',
})
export class DevtoolsPanelComponent {
  devtools = inject(DevtoolsService);

  goToCode = output<ElementFingerprint>();

  activeSubTab = this.devtools.activeSubTab;

  private profilerPollInterval: any = null;

  constructor() {
    this.devtools.checkAvailability().then((available) => {
      if (available) {
        this.devtools.fetchComponentTree();
      }
    });
  }

  refresh(): void {
    this.devtools.fetchComponentTree();
  }

  onNodeClick(node: ComponentTreeNode): void {
    this.devtools.selectNode(node);
    this.devtools.highlightElement(node.ongId);
  }

  onNodeToggle(event: Event, node: ComponentTreeNode): void {
    event.stopPropagation();
    this.devtools.toggleExpanded(node);
  }

  onNodeHover(node: ComponentTreeNode): void {
    this.devtools.highlightElement(node.ongId);
  }

  onNodeHoverEnd(): void {
    this.devtools.clearHighlight();
  }

  goToSource(): void {
    const detail = this.devtools.selectedDetail();
    if (!detail || !detail.file) return;

    const fingerprint: ElementFingerprint = {
      componentName: detail.componentName,
      tagName: detail.selector,
      ongAnnotation: {
        file: detail.file,
        line: detail.line,
        col: 0,
        tag: detail.selector,
        component: detail.componentName,
        selector: detail.selector,
        tsFile: '',
        parent: null,
        inLoop: detail.inLoop,
        conditional: detail.conditional,
        text: { hasText: false, type: 'none', content: '' },
        bindings: { inputs: {}, outputs: {}, twoWay: {}, structural: [] },
      },
    };

    this.goToCode.emit(fingerprint);
  }

  clearSelection(): void {
    this.devtools.selectedNode.set(null);
    this.devtools.selectedDetail.set(null);
    this.devtools.clearHighlight();
  }

  truncate(value: string, max = 60): string {
    if (!value) return '';
    return value.length > max ? value.slice(0, max) + '...' : value;
  }

  // ── Value Editing ──

  editingProp = signal<string | null>(null);
  editValue = '';

  startEdit(prop: PropertyInfo | { name: string; value: string; type: string; editable: boolean }): void {
    if (!prop.editable) return;
    this.editingProp.set(prop.name);
    this.editValue = prop.value;
  }

  cancelEdit(): void {
    this.editingProp.set(null);
    this.editValue = '';
  }

  async commitEdit(propName: string, isSignal: boolean): Promise<void> {
    const detail = this.devtools.selectedDetail();
    if (!detail) return;

    // Convert UI value to JS expression
    let jsValue = this.editValue.trim();
    // Auto-quote strings that aren't already valid JS literals
    if (jsValue !== 'null' && jsValue !== 'undefined' && jsValue !== 'true' && jsValue !== 'false'
      && isNaN(Number(jsValue)) && !jsValue.startsWith('"') && !jsValue.startsWith("'")
      && !jsValue.startsWith('[') && !jsValue.startsWith('{')) {
      jsValue = JSON.stringify(jsValue);
    }

    const success = await this.devtools.setPropertyValue(detail.ongId, propName, jsValue, isSignal);
    if (success) {
      this.editingProp.set(null);
      this.editValue = '';
    }
  }

  onEditKeydown(event: KeyboardEvent, propName: string, isSignal: boolean): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitEdit(propName, isSignal);
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  // Toggle boolean values inline
  async toggleBoolean(prop: PropertyInfo | { name: string; value: string; type: string; editable: boolean }): Promise<void> {
    const detail = this.devtools.selectedDetail();
    if (!detail) return;
    const newVal = prop.value === 'true' ? 'false' : 'true';
    await this.devtools.setPropertyValue(detail.ongId, prop.name, newVal, prop.type === 'signal');
  }

  // ── Performance Profiler ──

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

  // ── Signal Graph ──

  loadSignalGraph(): void {
    this.devtools.fetchSignalGraph();
  }

  selectSignalNode(node: SignalNode): void {
    this.devtools.selectedSignalNode.set(
      this.devtools.selectedSignalNode()?.id === node.id ? null : node
    );
  }

  signalNodeColor(type: string): string {
    switch (type) {
      case 'signal': return '#3b82f6';
      case 'computed': return '#8b5cf6';
      case 'effect': return '#ef4444';
      default: return 'var(--text-secondary)';
    }
  }

  // ── Routes ──

  loadRoutes(): void {
    this.devtools.fetchRouteTree();
  }
}
