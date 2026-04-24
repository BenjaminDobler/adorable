import { Injectable, inject, signal } from '@angular/core';
import { CdpService } from './cdp.service';
import { ComponentTreeNode, ComponentDetail } from './devtools.types';

@Injectable({
  providedIn: 'root',
})
export class ComponentInspectorService {
  private cdp = inject(CdpService);

  componentTree = signal<ComponentTreeNode[]>([]);
  selectedNode = signal<ComponentTreeNode | null>(null);
  selectedDetail = signal<ComponentDetail | null>(null);
  loading = signal(false);
  panelVisible = signal(false);
  activeSubTab = signal<'components' | 'performance' | 'signals' | 'routes'>('components');

  private domObserverInstalled = false;
  private domRefreshTimer: ReturnType<typeof setInterval> | null = null;

  async installDomObserver(): Promise<void> {
    if (this.domObserverInstalled) return;
    try {
      await this.cdp.evaluate(`
        (function() {
          if (window.__adorable_dom_observer) return;
          window.__adorable_dom_observer = new MutationObserver(function(mutations) {
            var dominated = false;
            for (var i = 0; i < mutations.length; i++) {
              if (mutations[i].addedNodes.length > 0 || mutations[i].removedNodes.length > 0) {
                dominated = true;
                break;
              }
            }
            if (dominated) {
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
    this.cdp.evaluate(`
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
    this.domRefreshTimer = setInterval(async () => {
      if (!this.panelVisible() || this.activeSubTab() !== 'components') return;
      try {
        const changed = await this.cdp.evaluate(`
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
          var seenComps = new Set();
          var nodeList = [];
          var ongIdCounts = {};

          function makeStableId(ongAttr, fallbackTag, nodeIndex) {
            if (ongAttr) {
              var count = ongIdCounts[ongAttr] || 0;
              ongIdCounts[ongAttr] = count + 1;
              return count === 0 ? ongAttr : ongAttr + '_' + count;
            }
            return '__' + fallbackTag + '_' + nodeIndex;
          }

          function walkDOM(el, parentCompIdx) {
            if (!el) return;
            if (!(el instanceof Element)) return;

            var comp = null;
            var dirs = [];
            var myCompIdx = parentCompIdx;
            try { comp = window.ng.getComponent(el); } catch(e) {}

            if (comp) {
              try {
                if (window.ng.getHostElement) {
                  var hostEl = window.ng.getHostElement(comp);
                  if (hostEl !== el) comp = null;
                }
              } catch(e) {}
              if (comp && seenComps.has(comp)) comp = null;
              if (comp) seenComps.add(comp);
            }

            try {
              var d = window.ng.getDirectives(el);
              if (d && d.length > 0) {
                for (var di = 0; di < d.length; di++) {
                  dirs.push(d[di].constructor.name);
                }
              }
            } catch(e) {}

            if (comp) {
              var ongAttr = el.getAttribute('_ong') || '';
              var ann = ongAttr ? (annotations[ongAttr] || {}) : {};
              var stableId = makeStableId(ongAttr, el.tagName.toLowerCase(), nodeList.length);
              el.setAttribute('data-adt-id', stableId);

              var displaySelector = el.tagName.toLowerCase();
              var compName = comp.constructor.name || '';
              try {
                if (window.ng.getDirectiveMetadata) {
                  var meta = window.ng.getDirectiveMetadata(comp);
                  if (meta && meta.name) compName = meta.name;
                  if (meta && meta.selector) displaySelector = meta.selector;
                }
              } catch(e) {}

              if (ann.selector && ann.tag === el.tagName.toLowerCase()) {
                displaySelector = ann.selector;
              }

              var file = '';
              var line = 0;
              if (ann.tag === el.tagName.toLowerCase()) {
                file = ann.file || '';
                line = ann.line || 0;
              }

              myCompIdx = nodeList.length;
              nodeList.push({
                ongId: stableId,
                tag: el.tagName.toLowerCase(),
                componentName: compName,
                selector: displaySelector,
                displayName: el.tagName.toLowerCase(),
                file: file,
                line: line,
                isComponent: true,
                directives: dirs,
                parentIdx: parentCompIdx,
                children: [],
                expanded: false
              });
            } else if (dirs.length > 0) {
              var dOngAttr = el.getAttribute('_ong') || '';
              var dAnn = dOngAttr ? (annotations[dOngAttr] || {}) : {};
              var dStableId = makeStableId(dOngAttr, el.tagName.toLowerCase(), nodeList.length);
              el.setAttribute('data-adt-id', dStableId);

              nodeList.push({
                ongId: dStableId,
                tag: el.tagName.toLowerCase(),
                componentName: '',
                selector: el.tagName.toLowerCase(),
                displayName: el.tagName.toLowerCase(),
                file: dAnn.file || '',
                line: dAnn.line || 0,
                isComponent: false,
                directives: dirs,
                parentIdx: parentCompIdx,
                children: [],
                expanded: false
              });
            }

            var child = el.firstElementChild;
            while (child) {
              walkDOM(child, myCompIdx);
              child = child.nextElementSibling;
            }
          }

          walkDOM(document.body, -1);

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

      const result = await this.cdp.evaluate(expression);
      if (Array.isArray(result)) {
        const expandedIds = new Set<string>();
        const collectExpanded = (nodes: ComponentTreeNode[]) => {
          for (const n of nodes) {
            if (n.expanded) expandedIds.add(n.ongId);
            if (n.children) collectExpanded(n.children);
          }
        };
        collectExpanded(this.componentTree());

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
        this.installDomObserver();
      }
    } catch (err) {
      console.error('[ComponentInspectorService] fetchComponentTree failed:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async fetchComponentDetails(ongId: string): Promise<void> {
    this.loading.set(true);
    try {
      const expression = `
        (function() {
          var el = document.querySelector('[data-adt-id="${ongId}"]') || document.querySelector('[_ong="${ongId}"]');
          if (!el) return null;

          var compEl = el;
          var comp = null;
          while (compEl) {
            try {
              comp = window.ng && window.ng.getComponent(compEl);
              if (comp) break;
            } catch(e) {}
            compEl = compEl.parentElement;
          }

          var realOngId = el.getAttribute('_ong') || '';
          var ann = realOngId ? ((window.__ong_annotations || {})[realOngId] || {}) : {};
          if (compEl && compEl !== el) {
            var compOngId = compEl.getAttribute('_ong');
            if (compOngId) {
              var compAnn = (window.__ong_annotations || {})[compOngId] || {};
              if (compAnn.component) ann = compAnn;
            }
          }

          var componentName = '';
          var properties = [];
          var directives = [];
          var inputs = [];
          var outputs = [];

          function isAnySignal(v) {
            if (typeof v !== 'function') return false;
            if (typeof v.set === 'function') return true;
            try {
              if (v.name === '' || v.name === 'signalFn' || v.name === 'getter' || v.name === 'inputValueFn') return true;
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

          function isOutput(v) {
            if (!v || typeof v !== 'object') return false;
            return (v.constructor && (v.constructor.name === 'OutputEmitterRef' || v.constructor.name === 'EventEmitter'))
              || (typeof v.emit === 'function' && typeof v.subscribe === 'function');
          }

          function readSignal(v) {
            try { return v(); } catch(e) { return undefined; }
          }

          function serialize(v) {
            if (v === undefined) return 'undefined';
            if (v === null) return 'null';
            try {
              var s = JSON.stringify(v);
              if (s === undefined) return String(v);
              return s;
            } catch(e) { return String(v); }
          }

          function isEditable(v) {
            if (v === null || v === undefined) return true;
            var t = typeof v;
            return t === 'string' || t === 'number' || t === 'boolean';
          }

          var FRAMEWORK_INTERNALS = {
            'elementRef': true, 'el': true, 'elRef': true,
            'zone': true, 'ngZone': true, '_ngZone': true,
            'cdr': true, 'cd': true, 'changeDetectorRef': true, 'cdRef': true,
            'renderer': true, 'renderer2': true,
            'injector': true,
            'destroyRef': true,
            'viewContainerRef': true, 'vcRef': true, 'vcr': true,
            '__ngContext__': true, '__ngSimpleChanges__': true
          };

          function isFrameworkInternal(name, raw) {
            if (FRAMEWORK_INTERNALS[name]) return true;
            if (!raw || typeof raw !== 'object') return false;
            var cn = raw.constructor ? raw.constructor.name : '';
            if (cn === 'ElementRef' || cn === 'NgZone' || cn === 'Renderer2' ||
                cn === 'ChangeDetectorRef' || cn === 'Injector' || cn === 'ViewContainerRef' ||
                cn === 'DestroyRef' || cn === 'EnvironmentInjector' || cn === 'NodeInjector' ||
                cn === 'R3Injector' || cn === 'ChainedInjector') return true;
            return false;
          }

          try {
            if (comp) {
              componentName = comp.constructor.name;

              var metaInputs = {};
              var metaOutputs = {};
              try {
                if (window.ng.getDirectiveMetadata) {
                  var meta = window.ng.getDirectiveMetadata(comp);
                  if (meta) {
                    if (meta.inputs) {
                      var ik = Object.keys(meta.inputs);
                      for (var mi = 0; mi < ik.length; mi++) {
                        var inputPropName = ik[mi];
                        var inputPublicName = meta.inputs[inputPropName];
                        if (typeof inputPublicName === 'object' && inputPublicName !== null) {
                          metaInputs[inputPublicName.publicName || inputPropName] = true;
                        } else {
                          metaInputs[typeof inputPublicName === 'string' ? inputPublicName : inputPropName] = true;
                        }
                        metaInputs[inputPropName] = true;
                      }
                    }
                    if (meta.outputs) {
                      var ok = Object.keys(meta.outputs);
                      for (var moi = 0; moi < ok.length; moi++) {
                        var outputPropName = ok[moi];
                        var outputPublicName = meta.outputs[outputPropName];
                        if (typeof outputPublicName === 'object' && outputPublicName !== null) {
                          metaOutputs[outputPublicName.publicName || outputPropName] = true;
                        } else {
                          metaOutputs[typeof outputPublicName === 'string' ? outputPublicName : outputPropName] = true;
                        }
                        metaOutputs[outputPropName] = true;
                      }
                    }
                  }
                }
              } catch(e) {}

              var bindings = ann.bindings || {};
              var annInputKeys = bindings.inputs ? Object.keys(bindings.inputs) : [];
              var annOutputKeys = bindings.outputs ? Object.keys(bindings.outputs) : [];
              for (var aii = 0; aii < annInputKeys.length; aii++) metaInputs[annInputKeys[aii]] = true;
              for (var aoi = 0; aoi < annOutputKeys.length; aoi++) metaOutputs[annOutputKeys[aoi]] = true;

              var outputNames = {};
              var allKeys = Object.getOwnPropertyNames(comp);

              for (var i = 0; i < allKeys.length; i++) {
                var k = allKeys[i];
                if (k.startsWith('__') || k === 'constructor') continue;

                try {
                  var raw = comp[k];
                  if (isFrameworkInternal(k, raw)) continue;

                  if (isOutput(raw)) {
                    outputs.push(k);
                    outputNames[k] = true;
                    continue;
                  }

                  if (isAnySignal(raw)) {
                    var val = readSignal(raw);
                    var writable = isWritableSignal(raw);
                    var sigType = writable ? 'signal' : 'readonly';
                    var prop = {
                      name: k,
                      value: serialize(val),
                      type: sigType,
                      valueType: typeof val,
                      editable: writable && isEditable(val)
                    };
                    if (metaInputs[k]) {
                      inputs.push(prop);
                    } else {
                      properties.push(prop);
                    }
                    continue;
                  }

                  if (typeof raw === 'function') continue;

                  var prop = {
                    name: k,
                    value: serialize(raw),
                    type: 'property',
                    valueType: typeof raw,
                    editable: isEditable(raw)
                  };
                  if (metaInputs[k]) {
                    inputs.push(prop);
                  } else {
                    properties.push(prop);
                  }
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

              var foundInputNames = {};
              for (var fi = 0; fi < inputs.length; fi++) foundInputNames[inputs[fi].name] = true;
              var allMetaInputKeys = Object.keys(metaInputs);
              for (var ri = 0; ri < allMetaInputKeys.length; ri++) {
                var rin = allMetaInputKeys[ri];
                if (foundInputNames[rin]) continue;
                try {
                  var rawInput = comp[rin];
                  if (rawInput === undefined) continue;
                  if (isAnySignal(rawInput)) {
                    inputs.push({
                      name: rin,
                      value: serialize(readSignal(rawInput)),
                      type: isWritableSignal(rawInput) ? 'signal' : 'readonly',
                      valueType: typeof readSignal(rawInput),
                      editable: isWritableSignal(rawInput) && isEditable(readSignal(rawInput))
                    });
                  } else if (typeof rawInput !== 'function') {
                    inputs.push({
                      name: rin,
                      value: serialize(rawInput),
                      type: 'property',
                      valueType: typeof rawInput,
                      editable: isEditable(rawInput)
                    });
                  }
                } catch(e) {}
              }

              var allMetaOutputKeys = Object.keys(metaOutputs);
              for (var roi = 0; roi < allMetaOutputKeys.length; roi++) {
                if (!outputNames[allMetaOutputKeys[roi]]) {
                  outputs.push(allMetaOutputKeys[roi]);
                  outputNames[allMetaOutputKeys[roi]] = true;
                }
              }
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
            ongId: "${ongId}",
            componentName: componentName || ann.component || '',
            selector: ann.selector || el.tagName.toLowerCase(),
            displayName: el.tagName.toLowerCase(),
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

      const result = await this.cdp.evaluate(expression);
      if (result) {
        this.selectedDetail.set(result as ComponentDetail);
      }
    } catch (err) {
      console.error('[ComponentInspectorService] fetchComponentDetails failed:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async highlightElement(ongId: string): Promise<void> {
    const expression = `
      (function() {
        var prev = document.getElementById('__adorable_devtools_highlight');
        if (prev) prev.remove();

        var el = document.querySelector('[data-adt-id="${ongId}"]') || document.querySelector('[_ong="${ongId}"]');
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
      await this.cdp.evaluate(expression);
    } catch { /* element may not exist */ }
  }

  async clearHighlight(): Promise<void> {
    try {
      await this.cdp.evaluate(
        `var h = document.getElementById('__adorable_devtools_highlight'); if (h) h.remove();`
      );
    } catch { /* ignore */ }
  }

  async setPropertyValue(ongId: string, propName: string, newValue: string, isSignal: boolean): Promise<boolean> {
    const expression = `
      (function() {
        var el = document.querySelector('[data-adt-id="${ongId}"]') || document.querySelector('[_ong="${ongId}"]');
        if (!el) return { success: false, error: 'Element not found' };
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
      const result = await this.cdp.evaluate(expression);
      if (result?.success) {
        await this.fetchComponentDetails(ongId);
        return true;
      }
      console.error('[ComponentInspectorService] setPropertyValue failed:', result?.error);
      return false;
    } catch (err) {
      console.error('[ComponentInspectorService] setPropertyValue failed:', err);
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

  onPreviewReloaded(): void {
    this.domObserverInstalled = false;
    if (this.domRefreshTimer) {
      clearInterval(this.domRefreshTimer);
      this.domRefreshTimer = null;
    }
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
}
