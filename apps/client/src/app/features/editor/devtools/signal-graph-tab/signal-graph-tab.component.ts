import { Component, inject } from '@angular/core';
import { DevtoolsService, SignalNode } from '../../../../core/services/devtools.service';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';

@Component({
  standalone: true,
  imports: [IconComponent],
  selector: 'app-signal-graph-tab',
  templateUrl: './signal-graph-tab.component.html',
  styleUrl: './signal-graph-tab.component.scss',
})
export class SignalGraphTabComponent {
  devtools = inject(DevtoolsService);

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

  truncate(value: string, max = 80): string {
    if (!value) return '';
    return value.length > max ? value.slice(0, max) + '...' : value;
  }
}
