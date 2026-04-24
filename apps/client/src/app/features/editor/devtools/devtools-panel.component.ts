import { Component, inject, output } from '@angular/core';
import { DevtoolsService } from '../../../core/services/devtools.service';
import { ElementFingerprint } from '../services/template';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ComponentTreeComponent } from './component-tree/component-tree.component';
import { PerformanceTabComponent } from './performance-tab/performance-tab.component';
import { SignalGraphTabComponent } from './signal-graph-tab/signal-graph-tab.component';
import { RouteTreeTabComponent } from './route-tree-tab/route-tree-tab.component';

@Component({
  standalone: true,
  imports: [
    IconComponent,
    ComponentTreeComponent,
    PerformanceTabComponent,
    SignalGraphTabComponent,
    RouteTreeTabComponent,
  ],
  selector: 'app-devtools-panel',
  templateUrl: './devtools-panel.component.html',
  styleUrl: './devtools-panel.component.scss',
})
export class DevtoolsPanelComponent {
  devtools = inject(DevtoolsService);
  goToCode = output<ElementFingerprint>();
  activeSubTab = this.devtools.activeSubTab;

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

  loadSignalGraph(): void {
    this.devtools.fetchSignalGraph();
  }

  loadRoutes(): void {
    this.devtools.fetchRouteTree();
  }
}
