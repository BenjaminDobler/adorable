import { Injectable, inject, signal } from '@angular/core';
import { CdpService } from './cdp.service';
import { SignalNode, SignalEdge } from './devtools.types';

@Injectable({
  providedIn: 'root',
})
export class SignalGraphService {
  private cdp = inject(CdpService);

  signalNodes = signal<SignalNode[]>([]);
  signalEdges = signal<SignalEdge[]>([]);
  signalGraphAvailable = signal(false);
  selectedSignalNode = signal<SignalNode | null>(null);

  async fetchSignalGraph(): Promise<void> {
    try {
      const result = await this.cdp.evaluate(`
        (function() {
          if (!window.ng || !window.ng.ɵgetSignalGraph) return { available: false };

          var root = document.querySelector('[ng-version]')
            || document.querySelector('app-root')
            || document.querySelector('[_ong]');
          if (!root) return { available: false };

          var inj = window.ng.getInjector(root);
          if (!inj) return { available: false };

          try {
            var graph = window.ng.ɵgetSignalGraph(inj);
            if (!graph) return { available: true, nodes: [], edges: [] };

            var nodes = [];
            var edges = [];
            if (graph.nodes) {
              for (var i = 0; i < graph.nodes.length; i++) {
                var n = graph.nodes[i];
                nodes.push({
                  id: n.id || String(i),
                  label: n.label || n.name || ('node_' + i),
                  type: n.type || 'signal',
                  value: n.value !== undefined ? String(n.value).substring(0, 200) : undefined
                });
              }
            }
            if (graph.edges) {
              for (var e = 0; e < graph.edges.length; e++) {
                edges.push({
                  from: String(graph.edges[e].from || graph.edges[e].source),
                  to: String(graph.edges[e].to || graph.edges[e].target)
                });
              }
            }
            return { available: true, nodes: nodes, edges: edges };
          } catch(e) {
            return { available: true, nodes: [], edges: [] };
          }
        })()
      `);

      if (result && typeof result === 'object') {
        this.signalGraphAvailable.set(result.available !== false);
        if (result.nodes) this.signalNodes.set(result.nodes);
        if (result.edges) this.signalEdges.set(result.edges);
      }
    } catch (err) {
      console.error('[SignalGraphService] fetchSignalGraph failed:', err);
      this.signalGraphAvailable.set(false);
    }
  }
}
