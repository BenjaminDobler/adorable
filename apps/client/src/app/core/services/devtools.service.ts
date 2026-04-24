import { Injectable, inject } from '@angular/core';
import { CdpService } from './devtools/cdp.service';
import { ComponentInspectorService } from './devtools/component-inspector.service';
import { ProfilerService } from './devtools/profiler.service';
import { SignalGraphService } from './devtools/signal-graph.service';
import { RouteInspectorService } from './devtools/route-inspector.service';
import { ToolTesterService } from './devtools/tool-tester.service';

// Re-export types so consumers can import from the original path
export type {
  ComponentTreeNode,
  ComponentDetail,
  PropertyInfo,
  ProfilerCycle,
  SignalNode,
  SignalEdge,
  RouteNode,
  ToolHistoryEntry,
} from './devtools/devtools.types';

/**
 * Facade that delegates to focused sub-services while preserving the original
 * public API surface. Consumers can inject DevtoolsService and access all
 * signals/methods as before, or inject sub-services directly for tighter coupling.
 */
@Injectable({
  providedIn: 'root',
})
export class DevtoolsService {
  private cdp = inject(CdpService);
  private inspector = inject(ComponentInspectorService);
  private profiler = inject(ProfilerService);
  private signals = inject(SignalGraphService);
  private routes = inject(RouteInspectorService);
  private tools = inject(ToolTesterService);

  // ── CDP ──
  readonly cdpAvailable = this.cdp.cdpAvailable;
  checkAvailability = () => this.cdp.checkAvailability();

  // ── Component Inspector ──
  readonly componentTree = this.inspector.componentTree;
  readonly selectedNode = this.inspector.selectedNode;
  readonly selectedDetail = this.inspector.selectedDetail;
  readonly loading = this.inspector.loading;
  readonly panelVisible = this.inspector.panelVisible;
  readonly activeSubTab = this.inspector.activeSubTab;
  readonly elementPickerActive = this.inspector.loading; // placeholder — not used currently

  fetchComponentTree = () => this.inspector.fetchComponentTree();
  fetchComponentDetails = (ongId: string) => this.inspector.fetchComponentDetails(ongId);
  highlightElement = (ongId: string) => this.inspector.highlightElement(ongId);
  clearHighlight = () => this.inspector.clearHighlight();
  setPropertyValue = (ongId: string, propName: string, newValue: string, isSignal: boolean) =>
    this.inspector.setPropertyValue(ongId, propName, newValue, isSignal);
  selectNode = (node: any) => this.inspector.selectNode(node);
  selectByOngId = (ongId: string) => this.inspector.selectByOngId(ongId);
  toggleExpanded = (node: any) => this.inspector.toggleExpanded(node);
  setPanelVisible = (visible: boolean) => this.inspector.setPanelVisible(visible);
  installDomObserver = () => this.inspector.installDomObserver();
  uninstallDomObserver = () => this.inspector.uninstallDomObserver();

  // ── Performance Profiler ──
  readonly profilerRecording = this.profiler.profilerRecording;
  readonly profilerCycles = this.profiler.profilerCycles;

  startProfiler = () => this.profiler.startProfiler();
  stopProfiler = () => this.profiler.stopProfiler();
  pollProfilerData = () => this.profiler.pollProfilerData();
  exportProfileData = () => this.profiler.exportProfileData();

  // ── Signal Graph ──
  readonly signalNodes = this.signals.signalNodes;
  readonly signalEdges = this.signals.signalEdges;
  readonly signalGraphAvailable = this.signals.signalGraphAvailable;
  readonly selectedSignalNode = this.signals.selectedSignalNode;

  fetchSignalGraph = () => this.signals.fetchSignalGraph();

  // ── Route Inspector ──
  readonly routeTree = this.routes.routeTree;
  readonly activeRoute = this.routes.activeRoute;

  fetchRouteTree = () => this.routes.fetchRouteTree();
  updateActiveRoute = (route: string) => this.routes.updateActiveRoute(route);

  // ── Tool Tester ──
  readonly toolResult = this.tools.toolResult;
  readonly toolRunning = this.tools.toolRunning;
  readonly toolHistory = this.tools.toolHistory;

  executeTool = (toolName: string, toolArgs: Record<string, unknown>) =>
    this.tools.executeTool(toolName, toolArgs);
  clearToolHistory = () => this.tools.clearToolHistory();

  // ── Lifecycle ──
  onPreviewReloaded(): void {
    this.inspector.onPreviewReloaded();

    this.cdp.checkAvailability().then((available) => {
      if (!available) return;
      setTimeout(() => {
        const tab = this.inspector.activeSubTab();
        if (tab === 'components') {
          this.inspector.fetchComponentTree();
        } else if (tab === 'routes' && this.routes.routeTree().length > 0) {
          this.routes.fetchRouteTree();
        }
      }, 1500);
    });
  }
}
