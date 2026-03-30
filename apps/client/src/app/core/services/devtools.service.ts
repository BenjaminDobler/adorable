import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ProjectService } from './project';

export interface ComponentTreeNode {
  ongId: string;
  tag: string;
  componentName: string;
  selector: string;
  file: string;
  line: number;
  isComponent: boolean;
  directives: string[];
  children: ComponentTreeNode[];
  expanded: boolean;
}

export interface PropertyInfo {
  name: string;
  value: string;
  type: 'signal' | 'readonly' | 'property';
  valueType: string;
  editable: boolean;
}

export interface ComponentDetail {
  ongId: string;
  componentName: string;
  selector: string;
  file: string;
  line: number;
  properties: PropertyInfo[];
  inputs: PropertyInfo[];
  outputs: string[];
  directives: string[];
  inLoop: boolean;
  conditional: boolean;
}

export interface ProfilerCycle {
  id: number;
  timestamp: number;
  duration: number;
  components: { name: string; duration: number }[];
}

export interface SignalNode {
  id: string;
  label: string;
  type: 'signal' | 'computed' | 'effect';
  value?: string;
}

export interface SignalEdge {
  from: string;
  to: string;
}

export interface RouteNode {
  path: string;
  component: string;
  active: boolean;
  guards: string[];
  lazy: boolean;
  children: RouteNode[];
}

@Injectable({
  providedIn: 'root',
})
export class DevtoolsService {
  private http = inject(HttpClient);
  private projectService = inject(ProjectService);
  private apiUrl =
    ((window as any).electronAPI?.nativeAgentUrl || 'http://localhost:3334') +
    '/api/native/cdp/evaluate';

  componentTree = signal<ComponentTreeNode[]>([]);
  selectedNode = signal<ComponentTreeNode | null>(null);
  selectedDetail = signal<ComponentDetail | null>(null);
  cdpAvailable = signal(false);
  loading = signal(false);
  elementPickerActive = signal(false);

  // DOM observer — only active when devtools panel is visible
  private domObserverInstalled = false;
  private domRefreshTimer: any = null;
  panelVisible = signal(false);

  // Performance profiler
  profilerRecording = signal(false);
  profilerCycles = signal<ProfilerCycle[]>([]);

  // Signal graph
  signalNodes = signal<SignalNode[]>([]);
  signalEdges = signal<SignalEdge[]>([]);
  signalGraphAvailable = signal(false);
  selectedSignalNode = signal<SignalNode | null>(null);

  // Router
  routeTree = signal<RouteNode[]>([]);
  activeRoute = signal<string>('');
  activeSubTab = signal<'components' | 'performance' | 'signals' | 'routes'>('components');

  // Tool tester
  toolResult = signal<string>('');
  toolRunning = signal(false);
  toolHistory = signal<{ tool: string; args: Record<string, any>; result: string; timestamp: number; isError: boolean }[]>([]);

  async checkAvailability(): Promise<boolean> {
    try {
      const result = await this.cdpEvaluate('typeof window.ng !== "undefined"');
      const available = result === true || result === 'true';
      this.cdpAvailable.set(available);
      return available;
    } catch {
      this.cdpAvailable.set(false);
      return false;
    }
  }

  async installDomObserver(): Promise<void> {
    if (this.domObserverInstalled) return;
    try {
      await this.cdpEvaluate(`
        (function() {
          if (window.__adorable_dom_observer) return;
          window.__adorable_dom_observer = new MutationObserver(function(mutations) {
            // Only care about added/removed nodes (structural changes)
            var dominated = false;
            for (var i = 0; i < mutations.length; i++) {
              if (mutations[i].addedNodes.length > 0 || mutations[i].removedNodes.length > 0) {
                dominated = true;
                break;
              }
            }
            if (dominated) {
              // Debounce: set a flag, the host polls it
              window.__adorable_dom_changed = true;
            }
          });
          window.__adorable_dom_observer.observe(document.body, {
            childList: true,
            subtree: true
          });
          window.__adorable_dom_changed = false;
        })()
      `);
      this.domObserverInstalled = true;
      this.startDomPolling();
    } catch {
      // CDP not available
    }
  }

  uninstallDomObserver(): void {
    this.domObserverInstalled = false;
    if (this.domRefreshTimer) {
      clearInterval(this.domRefreshTimer);
      this.domRefreshTimer = null;
    }
    this.cdpEvaluate(`
      if (window.__adorable_dom_observer) {
        window.__adorable_dom_observer.disconnect();
        window.__adorable_dom_observer = null;
      }
    `).catch(() => {});
  }

  setPanelVisible(visible: boolean): void {
    this.panelVisible.set(visible);
    if (visible && this.domObserverInstalled && !this.domRefreshTimer) {
      this.startDomPolling();
    } else if (!visible && this.domRefreshTimer) {
      clearInterval(this.domRefreshTimer);
      this.domRefreshTimer = null;
    }
  }

  private startDomPolling(): void {
    if (this.domRefreshTimer) return;
    if (!this.panelVisible()) return;
    // Poll the flag every 2 seconds — lightweight since it's just reading a boolean
    this.domRefreshTimer = setInterval(async () => {
      if (!this.panelVisible() || this.activeSubTab() !== 'components') return;
      try {
        const changed = await this.cdpEvaluate(`
          (function() {
            if (window.__adorable_dom_changed) {
              window.__adorable_dom_changed = false;
              return true;
            }
            return false;
          })()
        `);
        if (changed === true) {
          this.fetchComponentTree();
        }
      } catch {
        // Preview may have reloaded, stop polling
        this.domObserverInstalled = false;
        if (this.domRefreshTimer) {
          clearInterval(this.domRefreshTimer);
          this.domRefreshTimer = null;
        }
      }
    }, 2000);
  }


  async fetchComponentTree(): Promise<void> {
    this.loading.set(true);
    try {
      const expression = `
        (function() {
          if (!window.ng || !window.ng.getComponent) return [];

          var annotations = window.__ong_annotations || {};
          var seenEls = new Set();
          var nodeList = []; // flat list, we build the tree at the end

          // Walk the DOM to find components AND directive-bearing elements
          function walkDOM(el, parentCompIdx) {
            if (!el || seenEls.has(el)) return;
            seenEls.add(el);

            var comp = null;
            var dirs = [];
            var myCompIdx = parentCompIdx;
            try { comp = window.ng.getComponent(el); } catch(e) {}
            try {
              var d = window.ng.getDirectives(el);
              if (d && d.length > 0) {
                for (var di = 0; di < d.length; di++) {
                  dirs.push(d[di].constructor.name);
                }
              }
            } catch(e) {}

            if (comp) {
              // Component host element
              var ongId = el.getAttribute('_ong') || '';
              var ann = ongId ? (annotations[ongId] || {}) : {};
              myCompIdx = nodeList.length;
              nodeList.push({
                ongId: ongId || ('__comp_' + myCompIdx),
                tag: el.tagName.toLowerCase(),
                componentName: comp.constructor.name || ann.component || '',
                selector: ann.selector || el.tagName.toLowerCase(),
                file: ann.file || '',
                line: ann.line || 0,
                isComponent: true,
                directives: dirs,
                parentIdx: parentCompIdx,
                children: [],
                expanded: false
              });
            } else if (dirs.length > 0) {
              // Non-component element with directives (e.g. a[RouterLink])
              var dOngId = el.getAttribute('_ong') || '';
              var dAnn = dOngId ? (annotations[dOngId] || {}) : {};
              var dIdx = nodeList.length;
              nodeList.push({
                ongId: dOngId || ('__dir_' + dIdx),
                tag: el.tagName.toLowerCase(),
                componentName: '',
                selector: el.tagName.toLowerCase(),
                file: dAnn.file || '',
                line: dAnn.line || 0,
                isComponent: false,
                directives: dirs,
                parentIdx: parentCompIdx,
                children: [],
                expanded: false
              });
              // Directive elements don't become parents — their children
              // still belong to the enclosing component
            }

            // Walk children
            var child = el.firstElementChild;
            while (child) {
              walkDOM(child, myCompIdx);
              child = child.nextElementSibling;
            }
          }

          walkDOM(document.body, -1);

          // Build tree from parentIdx references
          var roots = [];
          for (var i = 0; i < nodeList.length; i++) {
            var node = nodeList[i];
            var pIdx = node.parentIdx;
            delete node.parentIdx;
            if (pIdx >= 0 && pIdx < nodeList.length) {
              nodeList[pIdx].children.push(node);
            } else {
              roots.push(node);
            }
          }

          return roots;
        })()
      `;

      const result = await this.cdpEvaluate(expression);
      if (Array.isArray(result)) {
        // Preserve expanded state from the previous tree
        const expandedIds = new Set<string>();
        const collectExpanded = (nodes: ComponentTreeNode[]) => {
          for (const n of nodes) {
            if (n.expanded) expandedIds.add(n.ongId);
            if (n.children) collectExpanded(n.children);
          }
        };
        collectExpanded(this.componentTree());

        // Restore expanded state on new tree
        if (expandedIds.size > 0) {
          const restoreExpanded = (nodes: ComponentTreeNode[]) => {
            for (const n of nodes) {
              if (expandedIds.has(n.ongId)) n.expanded = true;
              if (n.children) restoreExpanded(n.children);
            }
          };
          restoreExpanded(result);
        }

        this.componentTree.set(result);
        // Install DOM observer to auto-refresh on structural changes
        this.installDomObserver();
      }
    } catch (err) {
      console.error('[DevtoolsService] fetchComponentTree failed:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async fetchComponentDetails(ongId: string): Promise<void> {
    this.loading.set(true);
    try {
      const expression = `
        (function() {
          var el = document.querySelector('[_ong="${ongId}"]');
          if (!el) return null;

          // Walk up to find the nearest element that has an Angular component
          var compEl = el;
          var comp = null;
          while (compEl) {
            try {
              comp = window.ng && window.ng.getComponent(compEl);
              if (comp) break;
            } catch(e) {}
            compEl = compEl.parentElement;
          }

          // Use the annotation from the original element for source info
          var ann = (window.__ong_annotations || {})[\"${ongId}\"] || {};
          // But if we walked up, also check the component element's annotation
          if (compEl && compEl !== el) {
            var compOngId = compEl.getAttribute('_ong');
            if (compOngId) {
              var compAnn = (window.__ong_annotations || {})[compOngId] || {};
              // Prefer the component's annotation for component-level info
              if (compAnn.component) ann = compAnn;
            }
          }

          var componentName = '';
          var properties = [];
          var directives = [];
          var inputs = [];
          var outputs = [];

          // Helper: check if a value is any kind of signal (writable or readonly)
          function isAnySignal(v) {
            if (typeof v !== 'function') return false;
            // Writable signal: has .set and .update
            if (typeof v.set === 'function') return true;
            // Readonly signal (input(), computed()): callable, has SIGNAL symbol
            // Check if calling it doesn't throw and it looks signal-like
            try {
              if (v.name === '' || v.name === 'signalFn' || v.name === 'getter' || v.name === 'inputValueFn') return true;
              // Angular signals have a [SIGNAL] property
              var keys = Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(v) : [];
              for (var s = 0; s < keys.length; s++) {
                if (String(keys[s]).indexOf('SIGNAL') !== -1) return true;
              }
            } catch(e) {}
            return false;
          }

          function isWritableSignal(v) {
            return typeof v === 'function' && typeof v.set === 'function';
          }

          // Helper: check if value is an OutputEmitterRef
          function isOutput(v) {
            if (!v || typeof v !== 'object') return false;
            return (v.constructor && (v.constructor.name === 'OutputEmitterRef' || v.constructor.name === 'EventEmitter'))
              || (typeof v.emit === 'function' && typeof v.subscribe === 'function');
          }

          // Helper: read signal value
          function readSignal(v) {
            try { return v(); } catch(e) { return undefined; }
          }

          // Helper: serialize a value safely
          function serialize(v) {
            if (v === undefined) return 'undefined';
            if (v === null) return 'null';
            try {
              var s = JSON.stringify(v);
              if (s === undefined) return String(v);
              return s;
            } catch(e) { return String(v); }
          }

          // Helper: is this a simple editable type?
          function isEditable(v) {
            if (v === null || v === undefined) return true;
            var t = typeof v;
            return t === 'string' || t === 'number' || t === 'boolean';
          }

          try {
            if (comp) {
              componentName = comp.constructor.name;

              // Collect all component properties, categorize them
              var inputNames = {};  // track which props are inputs
              var outputNames = {}; // track which props are outputs
              var keys = Object.keys(comp);

              for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (k.startsWith('_') || k.startsWith('__') || k === 'constructor') continue;
                try {
                  var raw = comp[k];

                  // Check if it's an output (EventEmitter or OutputEmitterRef)
                  if (isOutput(raw)) {
                    outputs.push(k);
                    outputNames[k] = true;
                    continue;
                  }

                  // Check if it's any kind of signal
                  if (isAnySignal(raw)) {
                    var val = readSignal(raw);
                    var writable = isWritableSignal(raw);
                    var sigType = writable ? 'signal' : 'readonly';

                    properties.push({
                      name: k,
                      value: serialize(val),
                      type: sigType,
                      valueType: typeof val,
                      editable: writable && isEditable(val)
                    });
                    continue;
                  }

                  // Skip regular methods
                  if (typeof raw === 'function') continue;

                  // Plain property
                  properties.push({
                    name: k,
                    value: serialize(raw),
                    type: 'property',
                    valueType: typeof raw,
                    editable: isEditable(raw)
                  });
                } catch(e) {
                  properties.push({
                    name: k,
                    value: '<error>',
                    type: 'property',
                    valueType: 'string',
                    editable: false
                  });
                }
              }

              // Now separate inputs from properties using annotation bindings
              var bindings = ann.bindings || {};
              var annInputs = bindings.inputs ? Object.keys(bindings.inputs) : [];
              var annOutputs = bindings.outputs ? Object.keys(bindings.outputs) : [];

              // Move annotated inputs from properties to inputs list
              for (var ai = 0; ai < annInputs.length; ai++) {
                var inputName = annInputs[ai];
                // Find in properties
                var found = false;
                for (var pi = 0; pi < properties.length; pi++) {
                  if (properties[pi].name === inputName) {
                    inputs.push(properties[pi]);
                    properties.splice(pi, 1);
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  // Input not found in properties — try reading directly
                  try {
                    var rawInput = comp[inputName];
                    if (isAnySignal(rawInput)) {
                      inputs.push({
                        name: inputName,
                        value: serialize(readSignal(rawInput)),
                        type: isWritableSignal(rawInput) ? 'signal' : 'readonly',
                        valueType: typeof readSignal(rawInput),
                        editable: isWritableSignal(rawInput) && isEditable(readSignal(rawInput))
                      });
                    } else if (rawInput !== undefined) {
                      inputs.push({
                        name: inputName,
                        value: serialize(rawInput),
                        type: 'property',
                        valueType: typeof rawInput,
                        editable: isEditable(rawInput)
                      });
                    } else {
                      inputs.push({ name: inputName, value: '', type: 'property', valueType: 'string', editable: false });
                    }
                  } catch(e) {
                    inputs.push({ name: inputName, value: '', type: 'property', valueType: 'string', editable: false });
                  }
                }
              }

              // Also add annotated outputs not already found
              for (var ao = 0; ao < annOutputs.length; ao++) {
                if (!outputNames[annOutputs[ao]]) {
                  outputs.push(annOutputs[ao]);
                }
              }

              // Remove outputs from properties list
              properties = properties.filter(function(p) { return !outputNames[p.name]; });
            }
          } catch(e) {}

          try {
            var dirs = window.ng && window.ng.getDirectives(compEl || el);
            if (dirs) {
              for (var d = 0; d < dirs.length; d++) {
                directives.push(dirs[d].constructor.name);
              }
            }
          } catch(e) {}

          return {
            ongId: \"${ongId}\",
            componentName: componentName || ann.component || '',
            selector: ann.selector || el.tagName.toLowerCase(),
            file: ann.file || '',
            line: ann.line || 0,
            properties: properties,
            inputs: inputs,
            outputs: outputs,
            directives: directives,
            inLoop: !!ann.inLoop,
            conditional: !!ann.conditional
          };
        })()
      `;

      const result = await this.cdpEvaluate(expression);
      if (result) {
        this.selectedDetail.set(result as ComponentDetail);
      }
    } catch (err) {
      console.error('[DevtoolsService] fetchComponentDetails failed:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async highlightElement(ongId: string): Promise<void> {
    const expression = `
      (function() {
        var prev = document.getElementById('__adorable_devtools_highlight');
        if (prev) prev.remove();

        var el = document.querySelector('[_ong="${ongId}"]');
        if (!el) return;

        var rect = el.getBoundingClientRect();
        var overlay = document.createElement('div');
        overlay.id = '__adorable_devtools_highlight';
        overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;' +
          'border:2px solid rgba(62,207,142,0.8);background:rgba(62,207,142,0.1);' +
          'transition:all 0.15s ease;' +
          'top:' + rect.top + 'px;left:' + rect.left + 'px;' +
          'width:' + rect.width + 'px;height:' + rect.height + 'px;';
        document.body.appendChild(overlay);

        setTimeout(function() { overlay.remove(); }, 2000);
      })()
    `;
    try {
      await this.cdpEvaluate(expression);
    } catch {}
  }

  async clearHighlight(): Promise<void> {
    try {
      await this.cdpEvaluate(
        `var h = document.getElementById('__adorable_devtools_highlight'); if (h) h.remove();`
      );
    } catch {}
  }

  async setPropertyValue(ongId: string, propName: string, newValue: string, isSignal: boolean): Promise<boolean> {
    // Parse the value string into a JS literal
    const expression = `
      (function() {
        var el = document.querySelector('[_ong="${ongId}"]');
        if (!el) return { success: false, error: 'Element not found' };
        // Walk up to find nearest component
        var compEl = el;
        var comp = null;
        while (compEl) {
          try {
            comp = window.ng && window.ng.getComponent(compEl);
            if (comp) break;
          } catch(e) {}
          compEl = compEl.parentElement;
        }
        if (!comp) return { success: false, error: 'No component instance' };
        try {
          var newVal = ${newValue};
          if (${isSignal}) {
            if (typeof comp['${propName}'] === 'function' && typeof comp['${propName}'].set === 'function') {
              comp['${propName}'].set(newVal);
            } else {
              return { success: false, error: 'Property is not a writable signal' };
            }
          } else {
            comp['${propName}'] = newVal;
          }
          // Trigger change detection
          if (window.ng && window.ng.applyChanges) {
            window.ng.applyChanges(comp);
          }
          return { success: true };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })()
    `;
    try {
      const result = await this.cdpEvaluate(expression);
      if (result?.success) {
        // Refresh detail to show updated values
        await this.fetchComponentDetails(ongId);
        return true;
      }
      console.error('[DevtoolsService] setPropertyValue failed:', result?.error);
      return false;
    } catch (err) {
      console.error('[DevtoolsService] setPropertyValue failed:', err);
      return false;
    }
  }

  selectNode(node: ComponentTreeNode): void {
    this.selectedNode.set(node);
    this.fetchComponentDetails(node.ongId);
  }

  selectByOngId(ongId: string): void {
    const found = this.findNodeInTree(ongId, this.componentTree());
    if (found) {
      this.selectedNode.set(found);
    }
    this.fetchComponentDetails(ongId);
  }

  toggleExpanded(node: ComponentTreeNode): void {
    this.componentTree.update((tree) => {
      const toggle = (nodes: ComponentTreeNode[]): ComponentTreeNode[] =>
        nodes.map((n) => {
          if (n.ongId === node.ongId) {
            return { ...n, expanded: !n.expanded };
          }
          return { ...n, children: toggle(n.children) };
        });
      return toggle(tree);
    });
  }

  // ── Tool Tester ──

  private agentBaseUrl =
    ((window as any).electronAPI?.nativeAgentUrl || 'http://localhost:3334');

  async executeTool(toolName: string, toolArgs: Record<string, any>): Promise<void> {
    this.toolRunning.set(true);
    this.toolResult.set('');
    const startTime = Date.now();

    try {
      let result: any;
      let isError = false;

      // CDP tools → local agent CDP endpoints
      if (toolName.startsWith('browse_')) {
        const endpoint = toolName.replace('browse_', '');
        const resp = await fetch(`${this.agentBaseUrl}/api/native/cdp/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toolArgs),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Inspect tools → local agent CDP evaluate
      else if (toolName.startsWith('inspect_')) {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/cdp/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: this.buildInspectExpression(toolName, toolArgs) }),
        });
        const data = await resp.json();
        result = data.result?.value ?? data.result ?? data;
        isError = !resp.ok;
      }
      // Shell commands → local agent exec (expects { cmd, args })
      else if (toolName === 'run_command' || toolName === 'verify_build') {
        let fullCmd: string;
        if (toolName === 'verify_build') {
          const isExternal = !!this.projectService.externalPath();
          const selectedApp = this.projectService.detectedConfig()?.selectedApp;
          fullCmd = isExternal
            ? (selectedApp ? `npx @richapps/ong build --project ${selectedApp}` : 'npx @richapps/ong build')
            : 'npm run build';
        } else {
          fullCmd = String(toolArgs['command'] || '');
        }
        // Use AbortController for timeout (120s for builds)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        try {
          const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', fullCmd] }),
            signal: controller.signal,
          });
          result = await resp.json();
          isError = !resp.ok || (result.exitCode && result.exitCode !== 0);
        } catch (e: any) {
          if (e.name === 'AbortError') {
            result = { error: 'Command timed out after 120 seconds', command: fullCmd };
          } else {
            throw e;
          }
          isError = true;
        } finally {
          clearTimeout(timeout);
        }
      }
      // Read file → local agent
      else if (toolName === 'read_file') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/read-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: toolArgs['path'] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Read multiple files → sequential reads
      else if (toolName === 'read_files') {
        const paths = String(toolArgs['paths']).split(',').map((p: string) => p.trim());
        const results: Record<string, string> = {};
        for (const p of paths) {
          try {
            const resp = await fetch(`${this.agentBaseUrl}/api/native/read-file`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: p }),
            });
            const data = await resp.json();
            results[p] = data.content ?? data.error ?? 'unknown';
          } catch (e: any) {
            results[p] = `Error: ${e.message}`;
          }
        }
        result = results;
      }
      // List directory → local agent
      else if (toolName === 'list_dir') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/readdir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: toolArgs['path'], withFileTypes: true }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Glob → run find command
      else if (toolName === 'glob') {
        const pattern = toolArgs['pattern'] || '**/*';
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `find . -path './${pattern}' -not -path '*/node_modules/*' 2>/dev/null | head -100`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Grep → run grep command
      else if (toolName === 'grep') {
        const pattern = toolArgs['pattern'] || '';
        const searchPath = toolArgs['path'] || '.';
        const caseSensitive = toolArgs['case_sensitive'] !== false;
        const flags = caseSensitive ? '' : '-i';
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `grep -rn ${flags} --include='*.ts' --include='*.html' --include='*.scss' --include='*.json' '${pattern.replace(/'/g, "'\\''")}' ${searchPath} 2>/dev/null | head -50`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Write file → run via shell
      else if (toolName === 'write_file') {
        const filePath = toolArgs['path'];
        const content = toolArgs['content'] || '';
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `mkdir -p "$(dirname '${filePath}')" && cat > '${filePath}' << 'ADORABLE_EOF'\n${content}\nADORABLE_EOF`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Edit file → run sed-like replacement via shell
      else if (toolName === 'edit_file') {
        result = { error: 'edit_file requires server-side context. Use run_command with sed for testing, or test via the AI chat.' };
        isError = true;
      }
      // Delete file → rm
      else if (toolName === 'delete_file') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `rm -f '${toolArgs['path']}'`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Rename → mv
      else if (toolName === 'rename_file') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `mv '${toolArgs['old_path']}' '${toolArgs['new_path']}'`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Copy → cp
      else if (toolName === 'copy_file') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `cp '${toolArgs['source_path']}' '${toolArgs['destination_path']}'`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // inspect_styles, inspect_dom, measure_element → CDP evaluate
      else if (['inspect_styles', 'inspect_dom', 'measure_element', 'get_bundle_stats'].includes(toolName)) {
        let expr = '';
        const sel = String(toolArgs['selector'] || '').replace(/'/g, "\\'");
        if (toolName === 'inspect_styles') {
          expr = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Not found'};var cs=getComputedStyle(el);var ps=['display','position','width','height','margin','padding','color','backgroundColor','opacity','visibility','overflow','zIndex','flexDirection','justifyContent','alignItems','gap','fontSize','fontWeight','border','borderRadius','transform'];var r={};for(var i=0;i<ps.length;i++){var v=cs[ps[i]];if(v&&v!=='none'&&v!=='normal'&&v!=='auto')r[ps[i]]=v;}return r;})()`;
        } else if (toolName === 'inspect_dom') {
          const depth = toolArgs['depth'] ?? 3;
          expr = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Not found'};return{html:el.outerHTML.substring(0,5000)};})()`;
        } else if (toolName === 'measure_element') {
          expr = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Not found'};var r=el.getBoundingClientRect();var cs=getComputedStyle(el);return{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),visible:r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden',inViewport:r.top<window.innerHeight&&r.bottom>0};})()`;
        } else {
          expr = `(function(){var e=performance.getEntriesByType('resource').filter(function(e){return e.name.endsWith('.js');});return e.map(function(e){return{name:e.name.split('/').pop(),size:e.transferSize||0};}).sort(function(a,b){return b.size-a.size;});})()`;
        }
        const resp = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: expr }),
        });
        const data = await resp.json();
        result = data.result?.value ?? data.result ?? data;
        isError = !resp.ok;
      }
      // Network monitoring → CDP network endpoint
      else if (toolName === 'inspect_network') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/cdp/network`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: toolArgs['action'] || 'get' }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Type text → CDP type endpoint
      else if (toolName === 'type_text') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/cdp/type`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: toolArgs['text'] || '' }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Inject CSS → CDP evaluate
      else if (toolName === 'inject_css') {
        const action = toolArgs['action'];
        let expr: string;
        if (action === 'clear') {
          expr = `(function(){var el=document.getElementById('__adorable_injected_css');if(el)el.remove();return{status:'cleared'};})()`;
        } else {
          const css = String(toolArgs['css'] || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
          expr = `(function(){var el=document.getElementById('__adorable_injected_css');if(!el){el=document.createElement('style');el.id='__adorable_injected_css';document.head.appendChild(el);}el.textContent+='\\n${css}';return{status:'injected'};})()`;
        }
        const resp = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: expr }),
        });
        const data = await resp.json();
        result = data.result?.value ?? data.result ?? data;
        isError = !resp.ok;
      }
      // Clear build cache → run_command
      else if (toolName === 'clear_build_cache') {
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', 'rm -rf .angular/cache .nx/cache node_modules/.cache 2>/dev/null; echo "Caches cleared"'] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // Container logs → run_command
      else if (toolName === 'get_container_logs') {
        const lines = toolArgs['lines'] || 50;
        const resp = await fetch(`${this.agentBaseUrl}/api/native/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: '/bin/sh', args: ['-c', `tail -n ${lines} /tmp/adorable-dev-server.log 2>/dev/null || echo "No log found"`] }),
        });
        result = await resp.json();
        isError = !resp.ok;
      }
      // inspect_errors → not available in tool tester (needs server context)
      else if (toolName === 'inspect_errors') {
        result = { info: 'inspect_errors parses the last verify_build output. Run a build first via the AI chat, then use inspect_errors there.' };
      }
      else {
        result = { error: `Tool "${toolName}" is not testable from the UI.` };
        isError = true;
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      this.toolResult.set(resultStr);
      this.toolHistory.update((h) => [{
        tool: toolName,
        args: toolArgs,
        result: resultStr.substring(0, 2000),
        timestamp: startTime,
        isError,
      }, ...h].slice(0, 50));
    } catch (err: any) {
      const errStr = `Error: ${err.message}`;
      this.toolResult.set(errStr);
      this.toolHistory.update((h) => [{
        tool: toolName,
        args: toolArgs,
        result: errStr,
        timestamp: startTime,
        isError: true,
      }, ...h].slice(0, 50));
    } finally {
      this.toolRunning.set(false);
    }
  }

  private buildInspectExpression(toolName: string, args: Record<string, any>): string {
    // Simplified versions of the inspect expressions from base.ts
    switch (toolName) {
      case 'inspect_component':
        if (args['selector']) {
          const sel = String(args['selector']);
          return `(function(){var el=document.querySelector('${sel.replace(/'/g, "\\'")}');if(!el)el=document.querySelector('[_ong="${sel.replace(/"/g, '\\"')}"]');if(!el)return{error:'not found'};var comp=window.ng&&window.ng.getComponent(el);var props={};if(comp){Object.keys(comp).forEach(function(k){if(!k.startsWith('_'))try{var v=comp[k];if(typeof v==='function'){try{props[k]='Signal('+JSON.stringify(v())+')'}catch(e){}}else{props[k]=JSON.stringify(v)}}catch(e){}});}return{tag:el.tagName.toLowerCase(),component:comp?comp.constructor.name:'',properties:props};})()`;
        }
        return `(function(){var els=[];function walk(el){try{var c=window.ng.getComponent(el);if(c)els.push({tag:el.tagName.toLowerCase(),component:c.constructor.name});}catch(e){}var ch=el.firstElementChild;while(ch){walk(ch);ch=ch.nextElementSibling;}}walk(document.body);return els;})()`;
      case 'inspect_performance':
        if (args['action'] === 'start') {
          return `(function(){window.__adorable_profiler_data=[];if(window.ng&&window.ng.ɵsetProfiler){window.ng.ɵsetProfiler(function(e,c){if(e===0){window.__pStart=performance.now();window.__pName=c?.constructor?.name||'?';}if(e===1){var d=performance.now()-window.__pStart;var data=window.__adorable_profiler_data;var last=data[data.length-1];if(!last||performance.now()-last.t>16){data.push({t:performance.now(),d:0,c:[]});last=data[data.length-1];}last.d+=d;var ex=last.c.find(function(x){return x.n===window.__pName;});if(ex)ex.d+=d;else last.c.push({n:window.__pName,d:d});}});return{status:'recording'};}return{error:'profiler not available'};})()`;
        }
        return `(function(){if(window.ng&&window.ng.ɵsetProfiler)window.ng.ɵsetProfiler(null);return window.__adorable_profiler_data||[];})()`;
      case 'inspect_routes':
        return `(function(){if(!window.ng)return{error:'router API unavailable'};var root=document.querySelector('[ng-version]')||document.querySelector('app-root');if(!root)return{error:'no root'};var inj=window.ng.getInjector(root);if(!inj)return{error:'no injector'};var r=null;if(window.ng.ɵgetRouterInstance){r=window.ng.ɵgetRouterInstance(inj);}if(!r&&window.ng.ɵgetInjectorProviders){try{var providers=window.ng.ɵgetInjectorProviders(inj);var rp=providers.find(function(p){return p.token&&p.token.name==='Router';});if(rp)r=inj.get(rp.token);}catch(e){}}if(!r)return{error:'no router'};return{url:r.url,routes:r.config.map(function(c){return{path:c.path,component:c.component?c.component.name:'',lazy:!!c.loadComponent||!!c.loadChildren};})};})()`;
      case 'inspect_signals':
        return `(function(){if(!window.ng||!window.ng.ɵgetSignalGraph)return{available:false};var root=document.querySelector('[ng-version]')||document.querySelector('app-root');if(!root)return{available:false};var inj=window.ng.getInjector(root);var g=window.ng.ɵgetSignalGraph(inj);return g||{available:true,nodes:[],edges:[]};})()`;
      default:
        return `({error:'unknown tool'})`;
    }
  }

  clearToolHistory(): void {
    this.toolHistory.set([]);
    this.toolResult.set('');
  }

  // ── Performance Profiler ──

  async startProfiler(): Promise<void> {
    this.profilerCycles.set([]);
    this.profilerRecording.set(true);
    const expression = `
      (function() {
        window.__adorable_profiler_data = [];
        window.__adorable_profiler_cycle = 0;
        if (window.ng && window.ng.ɵsetProfiler) {
          window.ng.ɵsetProfiler(function(event, context) {
            // event 0 = template begin, event 1 = template end
            if (event === 0) {
              window.__adorable_profiler_start = performance.now();
              window.__adorable_profiler_current = context?.constructor?.name || 'Unknown';
            }
            if (event === 1) {
              var dur = performance.now() - (window.__adorable_profiler_start || 0);
              var name = window.__adorable_profiler_current || 'Unknown';
              var cycle = window.__adorable_profiler_cycle;
              var data = window.__adorable_profiler_data;
              var last = data.length > 0 ? data[data.length - 1] : null;
              // Group into cycles (events within 16ms of each other)
              if (!last || (performance.now() - last.timestamp) > 16) {
                window.__adorable_profiler_cycle++;
                cycle = window.__adorable_profiler_cycle;
                data.push({ id: cycle, timestamp: performance.now(), duration: 0, components: [] });
                last = data[data.length - 1];
              }
              last.duration += dur;
              var existing = last.components.find(function(c) { return c.name === name; });
              if (existing) { existing.duration += dur; }
              else { last.components.push({ name: name, duration: dur }); }
            }
          });
          return true;
        }
        return false;
      })()
    `;
    try {
      const result = await this.cdpEvaluate(expression);
      if (!result) {
        this.profilerRecording.set(false);
      }
    } catch {
      this.profilerRecording.set(false);
    }
  }

  async stopProfiler(): Promise<void> {
    this.profilerRecording.set(false);
    const expression = `
      (function() {
        if (window.ng && window.ng.ɵsetProfiler) {
          window.ng.ɵsetProfiler(null);
        }
        return window.__adorable_profiler_data || [];
      })()
    `;
    try {
      const result = await this.cdpEvaluate(expression);
      if (Array.isArray(result)) {
        this.profilerCycles.set(result);
      }
    } catch (err) {
      console.error('[DevtoolsService] stopProfiler failed:', err);
    }
  }

  async pollProfilerData(): Promise<void> {
    if (!this.profilerRecording()) return;
    const expression = `window.__adorable_profiler_data || []`;
    try {
      const result = await this.cdpEvaluate(expression);
      if (Array.isArray(result)) {
        this.profilerCycles.set(result);
      }
    } catch {}
  }

  exportProfileData(): string {
    return JSON.stringify(this.profilerCycles(), null, 2);
  }

  // ── Signal Graph ──

  async fetchSignalGraph(): Promise<void> {
    this.loading.set(true);
    const expression = `
      (function() {
        // Try Angular 19+ signal graph API
        if (!window.ng || !window.ng.ɵgetSignalGraph) {
          return { available: false, nodes: [], edges: [] };
        }
        try {
          // Get the root injector from the app-root element
          var appRoot = document.querySelector('app-root') || document.querySelector('[_ong]');
          if (!appRoot) return { available: false, nodes: [], edges: [] };

          var injector = window.ng.getInjector(appRoot);
          if (!injector) return { available: false, nodes: [], edges: [] };

          var graph = window.ng.ɵgetSignalGraph(injector);
          if (!graph) return { available: true, nodes: [], edges: [] };

          var nodes = [];
          var edges = [];

          if (graph.nodes) {
            for (var i = 0; i < graph.nodes.length; i++) {
              var n = graph.nodes[i];
              var value = '';
              try { value = JSON.stringify(n.value).substring(0, 100); } catch(e) { value = '<unserializable>'; }
              nodes.push({
                id: String(n.id || i),
                label: n.label || n.name || ('node-' + i),
                type: n.type || 'signal',
                value: value
              });
            }
          }

          if (graph.edges) {
            for (var j = 0; j < graph.edges.length; j++) {
              var e = graph.edges[j];
              edges.push({ from: String(e.source || e.from), to: String(e.target || e.to) });
            }
          }

          return { available: true, nodes: nodes, edges: edges };
        } catch(e) {
          return { available: false, nodes: [], edges: [], error: e.message };
        }
      })()
    `;
    try {
      const result = await this.cdpEvaluate(expression);
      if (result) {
        this.signalGraphAvailable.set(result.available ?? false);
        this.signalNodes.set(result.nodes || []);
        this.signalEdges.set(result.edges || []);
      }
    } catch (err) {
      console.error('[DevtoolsService] fetchSignalGraph failed:', err);
      this.signalGraphAvailable.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Router ──

  async fetchRouteTree(): Promise<void> {
    this.loading.set(true);
    const expression = `
      (function() {
        try {
          if (!window.ng) return { routes: [], activeRoute: '', debug: 'no window.ng' };

          // Use the same approach as Angular DevTools:
          // 1. Find root element via [ng-version] attribute
          var appRoot = document.querySelector('[ng-version]')
            || document.querySelector('app-root')
            || document.querySelector('[_ong]');
          if (!appRoot) return { routes: [], activeRoute: '', debug: 'no root element' };

          // 2. Get injector from root element
          var injector = window.ng.getInjector(appRoot);
          if (!injector) return { routes: [], activeRoute: '', debug: 'no injector' };

          // 3. Use Angular's published ɵgetRouterInstance (same API Angular DevTools uses)
          //    This is published by provideRouter() in dev mode and does injector.get(Router)
          //    with the actual Router DI token.
          var router = null;
          if (window.ng.ɵgetRouterInstance) {
            router = window.ng.ɵgetRouterInstance(injector);
          }

          if (!router || !router.config) {
            return { routes: [], activeRoute: '', debug: 'router not found (ɵgetRouterInstance=' + !!window.ng.ɵgetRouterInstance + ')' };
          }

          var activeUrl = '';
          try { activeUrl = router.url || ''; } catch(e) {}

          // 4. Use ɵgetLoadedRoutes for lazy-loaded children (if available)
          var getLoadedRoutes = window.ng.ɵgetLoadedRoutes || function() { return undefined; };

          function mapRoutes(configs) {
            var result = [];
            for (var i = 0; i < configs.length; i++) {
              var r = configs[i];
              var path = r.path;
              if (path === undefined || path === null) path = '';
              var component = '';
              if (r.component) {
                component = r.component.name || '';
              }
              var guards = [];
              if (r.canActivate) {
                for (var g = 0; g < r.canActivate.length; g++) {
                  var guard = r.canActivate[g];
                  guards.push(typeof guard === 'function' ? (guard.name || 'guard') : 'guard');
                }
              }
              var lazy = !!r.loadComponent || !!r.loadChildren;

              // Get children: static children + lazily loaded children
              var children = r.children ? mapRoutes(r.children) : [];
              var loadedChildren = getLoadedRoutes(r);
              if (loadedChildren && loadedChildren.length > 0) {
                children = children.concat(mapRoutes(loadedChildren));
              }

              var fullPath = '/' + path;
              var isActive = activeUrl === fullPath
                || (path && activeUrl.startsWith(fullPath + '/'))
                || (path === '' && activeUrl === '/');
              result.push({
                path: path === '' ? '(root)' : path,
                component: component,
                active: isActive,
                guards: guards,
                lazy: lazy,
                children: children
              });
            }
            return result;
          }

          return { routes: mapRoutes(router.config), activeRoute: activeUrl };
        } catch(e) {
          return { routes: [], activeRoute: '', debug: 'error: ' + e.message };
        }
      })()
    `;
    try {
      const result = await this.cdpEvaluate(expression);
      if (result) {
        this.routeTree.set(result.routes || []);
        this.activeRoute.set(result.activeRoute || '');
      }
    } catch (err) {
      console.error('[DevtoolsService] fetchRouteTree failed:', err);
    } finally {
      this.loading.set(false);
    }
  }

  updateActiveRoute(route: string): void {
    this.activeRoute.set(route);
    // Re-mark active flags in the existing tree without re-fetching
    this.routeTree.update((tree) => {
      function markActive(nodes: RouteNode[]): RouteNode[] {
        return nodes.map((n) => {
          const fullPath = '/' + (n.path === '(root)' ? '' : n.path);
          const isActive =
            route === fullPath ||
            (n.path !== '(root)' && route.startsWith(fullPath + '/')) ||
            (n.path === '(root)' && route === '/');
          return {
            ...n,
            active: isActive,
            children: markActive(n.children),
          };
        });
      }
      return markActive(tree);
    });
  }

  onPreviewReloaded(): void {
    // Observer is no longer valid after reload
    this.domObserverInstalled = false;
    if (this.domRefreshTimer) {
      clearInterval(this.domRefreshTimer);
      this.domRefreshTimer = null;
    }

    // Re-check availability and refresh active sub-tab data after preview reloads
    this.checkAvailability().then((available) => {
      if (!available) return;
      // Delay to let the app bootstrap after reload
      setTimeout(() => {
        const tab = this.activeSubTab();
        if (tab === 'components') {
          this.fetchComponentTree(); // this also reinstalls the observer
        } else if (tab === 'routes' && this.routeTree().length > 0) {
          this.fetchRouteTree();
        }
      }, 1500);
    });
  }

  private findNodeInTree(
    ongId: string,
    nodes: ComponentTreeNode[]
  ): ComponentTreeNode | null {
    for (const node of nodes) {
      if (node.ongId === ongId) return node;
      const found = this.findNodeInTree(ongId, node.children);
      if (found) return found;
    }
    return null;
  }

  private async cdpEvaluate(expression: string): Promise<any> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      if (!response.ok) throw new Error(`CDP evaluate failed: ${response.status}`);
      const data = await response.json();
      return data.result?.value ?? data.result ?? data;
    } catch (err) {
      throw err;
    }
  }
}
