export const RUNTIME_SCRIPTS = `
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
    // Storage Settings Loader — applies localStorage/cookie presets before the app bootstraps
    (function() {
      var agentUrl = 'http://localhost:' + (window.__adorable_agent_port || '3334');
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', agentUrl + '/api/native/storage-settings', false); // synchronous
        xhr.send();
        if (xhr.status === 200) {
          var settings = JSON.parse(xhr.responseText);
          if (settings.localStorage) {
            Object.keys(settings.localStorage).forEach(function(key) {
              localStorage.setItem(key, settings.localStorage[key]);
            });
          }
          if (settings.cookies) {
            Object.keys(settings.cookies).forEach(function(key) {
              document.cookie = key + '=' + encodeURIComponent(settings.cookies[key]) + '; path=/';
            });
          }
        }
      } catch(e) { /* agent not available — skip */ }
    })();

    // Console Interceptor — only active in iframe mode (window.parent !== window).
    // In Electron webview mode window.parent === window, so postMessage would loop back;
    // webview console output is captured natively via the console-message event instead.
    (function() {
      if (window.parent === window) return;

      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      function send(type, args) {
        const message = args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch (e) {
            return String(arg);
          }
        }).join(' ');
        window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: type, message }, '*');
      }

      console.log = function(...args) { originalLog.apply(console, args); send('log', args); };
      console.warn = function(...args) { originalWarn.apply(console, args); send('warn', args); };
      console.error = function(...args) { originalError.apply(console, args); send('error', args); };
    })();

    // Element ID helpers — supports both _ong annotations and legacy data-elements-id
    function __getElementId(el) {
      // Prefer _ong annotation (compile-time, from ong Vite plugin)
      var ongId = el.getAttribute('_ong');
      if (ongId) return '_ong:' + ongId;
      // Fall back to data-elements-id (AI-generated)
      return el.getAttribute('data-elements-id') || null;
    }
    function __getOngAnnotation(el) {
      var ongId = el.getAttribute('_ong');
      if (ongId && window.__ong_annotations) return window.__ong_annotations[ongId] || null;
      return null;
    }
    function __findElementById(id) {
      if (!id) return null;
      if (id.startsWith('_ong:')) {
        return document.querySelector('[_ong="' + id.slice(5) + '"]');
      }
      return document.querySelector('[data-elements-id="' + id + '"]');
    }

    // Visual Inspector Script
    (function() {
      let active = false;
      let overlay;
      let selectionOverlay;
      let selectedElement = null;
      let clickTimeout = null;
      let pendingClickEvent = null;

      function createOverlay() {
        if (document.getElementById('inspector-overlay')) return;
        overlay = document.createElement('div');
        overlay.id = 'inspector-overlay';
        overlay.style.position = 'fixed';
        overlay.style.border = '1px solid #2196F3';
        overlay.style.backgroundColor = 'transparent';
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
      }

      function createSelectionOverlay() {
        if (document.getElementById('inspector-selection')) return;
        selectionOverlay = document.createElement('div');
        selectionOverlay.id = 'inspector-selection';
        selectionOverlay.style.position = 'fixed';
        selectionOverlay.style.border = '2px solid #2196F3';
        selectionOverlay.style.backgroundColor = 'transparent';
        selectionOverlay.style.zIndex = '999998';
        selectionOverlay.style.pointerEvents = 'none';
        selectionOverlay.style.display = 'none';
        document.body.appendChild(selectionOverlay);

        // Add a label to show element info
        const label = document.createElement('div');
        label.id = 'inspector-selection-label';
        label.style.position = 'absolute';
        label.style.top = '-24px';
        label.style.left = '0';
        label.style.background = '#2196F3';
        label.style.color = '#fff';
        label.style.padding = '2px 8px';
        label.style.fontSize = '11px';
        label.style.fontFamily = 'monospace';
        label.style.fontWeight = 'bold';
        label.style.borderRadius = '4px 4px 0 0';
        label.style.whiteSpace = 'nowrap';
        selectionOverlay.appendChild(label);
      }

      function showSelectionOverlay(element) {
        createSelectionOverlay();
        selectedElement = element;
        selectedElementId = __getElementId(element);
        const sel = document.getElementById('inspector-selection');
        const label = document.getElementById('inspector-selection-label');
        if (!sel) return;

        const rect = element.getBoundingClientRect();
        sel.style.top = rect.top + 'px';
        sel.style.left = rect.left + 'px';
        sel.style.width = rect.width + 'px';
        sel.style.height = rect.height + 'px';
        sel.style.display = 'block';

        // Update label
        if (label) {
          const tagName = element.tagName.toLowerCase();
          const classes = element.className ? '.' + element.className.split(' ').slice(0, 2).join('.') : '';
          label.textContent = '<' + tagName + '>' + classes;
        }

        // Start observing element for size/content changes
        startObserving(element);
      }

      let resizeObserver = null;
      let selectedElementId = null;
      let domObserver = null;

      function hideSelectionOverlay() {
        const sel = document.getElementById('inspector-selection');
        if (sel) sel.style.display = 'none';
        stopObserving();
        selectedElement = null;
        selectedElementId = null;
      }

      // Update selection position on scroll/resize/element changes
      function updateSelectionPosition() {
        if (!selectedElement) return;
        const sel = document.getElementById('inspector-selection');
        if (!sel || sel.style.display === 'none') return;

        // Check if element is still in DOM, if not try to re-find by ID
        if (!document.body.contains(selectedElement) && selectedElementId) {
          const newElement = __findElementById(selectedElementId);
          if (newElement) {
            selectedElement = newElement;
            startObserving(newElement);
          } else {
            return; // Element gone, wait for it to reappear
          }
        }

        const rect = selectedElement.getBoundingClientRect();
        sel.style.top = rect.top + 'px';
        sel.style.left = rect.left + 'px';
        sel.style.width = rect.width + 'px';
        sel.style.height = rect.height + 'px';
      }

      function startObserving(element) {
        // Stop previous element observer
        if (resizeObserver) {
          resizeObserver.disconnect();
        }

        // Watch for size changes on the element
        resizeObserver = new ResizeObserver(() => {
          updateSelectionPosition();
        });
        resizeObserver.observe(element);

        // Start DOM observer if not already running
        if (!domObserver) {
          domObserver = new MutationObserver(() => {
            // Debounce updates
            requestAnimationFrame(updateSelectionPosition);
          });
          domObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
          });
        }
      }

      function stopObserving() {
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        }
        if (domObserver) {
          domObserver.disconnect();
          domObserver = null;
        }
      }

      window.addEventListener('scroll', updateSelectionPosition, true);
      window.addEventListener('resize', updateSelectionPosition);

      window.addEventListener('message', (event) => {
        if (event.data.type === 'TOGGLE_INSPECTOR') {
          active = event.data.enabled;
          createOverlay();
          if (!active) {
            // Inspector turned off - hide hover overlay and selection
            if (overlay) overlay.style.display = 'none';
            hideSelectionOverlay();
          }
        }

        if (event.data.type === 'CLEAR_SELECTION') {
          hideSelectionOverlay();
        }

        if (event.data.type === 'RELOAD_REQ') {
           window.location.reload();
        }

        if (event.data.type === 'RELOAD_TRANSLATIONS') {
          console.log('[adorable] RELOAD_TRANSLATIONS received');
          let reloaded = false;
          // The host passes the new translation content directly in the message,
          // so we can use setTranslation() instead of reloadLang() to avoid HTTP caching.
          var translationContent = event.data.content || null;
          var parsedTranslations = null;
          if (translationContent) {
            try { parsedTranslations = JSON.parse(translationContent); } catch(e) {}
          }
          try {
            const ng = window.ng;

            // Force change detection on all root Angular components.
            function forceChangeDetection() {
              if (!window.ng) return;
              try {
                var seen = new WeakSet();
                function forceCD(el) {
                  try {
                    var c = ng.getComponent(el);
                    if (c && !seen.has(c)) { seen.add(c); ng.applyChanges(c); }
                  } catch(e) {}
                }
                document.querySelectorAll('[ng-version]').forEach(forceCD);
                Array.from(document.body.children).forEach(forceCD);
              } catch(e) {}
            }

            // Duck-type check and invoke a translation service instance.
            function tryReloadService(svc) {
              if (!svc || typeof svc !== 'object') return false;
              // Transloco: has getActiveLang() + reloadLang()
              if (typeof svc.reloadLang === 'function' && typeof svc.getActiveLang === 'function') {
                svc.reloadLang(svc.getActiveLang()).subscribe?.();
                return true;
              }
              // ngx-translate: has currentLang string + reloadLang()
              if (typeof svc.reloadLang === 'function' && typeof svc.currentLang === 'string') {
                var lang = svc.currentLang;
                if (parsedTranslations && typeof svc.setTranslation === 'function') {
                  // Fast path: inject content directly — no HTTP round-trip, no cache issues.
                  // setTranslation fires onTranslationChange which calls markForCheck() on all
                  // TranslatePipe instances. use() re-emits onLangChange to trigger CD scheduling.
                  svc.setTranslation(lang, parsedTranslations, { shouldMerge: false });
                  if (typeof svc.use === 'function') svc.use(lang);
                  forceChangeDetection();
                } else {
                  // Fallback: re-fetch via HTTP (may hit browser cache).
                  svc.reloadLang(lang).subscribe(function() {
                    if (typeof svc.use === 'function') svc.use(lang);
                    forceChangeDetection();
                  });
                }
                return true;
              }
              return false;
            }

            // Scan all DOM elements — check both component properties AND the LView array.
            // When translate pipe is used (not injected directly), the pipe instance lives
            // in the LView (el.__ngContext__) from HEADER_OFFSET (~20) onwards.
            // The pipe instance has the TranslateService/TranslocoService as a property.
            const allEls = document.querySelectorAll('*');
            const checkedInstances = new WeakSet();

            function scanInstance(inst) {
              if (!inst || typeof inst !== 'object' || checkedInstances.has(inst)) return false;
              checkedInstances.add(inst);
              if (tryReloadService(inst)) return true;
              // One level deeper (e.g. pipe instance -> translate service property)
              const props = Object.getOwnPropertyNames(inst);
              for (const p of props) {
                let val;
                try { val = inst[p]; } catch { continue; }
                if (tryReloadService(val)) return true;
              }
              return false;
            }

            outer: for (const el of allEls) {
              const ctx = el['__ngContext__'];
              if (!ctx) continue;
              // Angular 17+: __ngContext__ is LContext {lView, nodeIndex, component}
              // Older Angular: __ngContext__ is the LView array directly
              const lView = Array.isArray(ctx) ? ctx : ctx.lView;
              if (!Array.isArray(lView)) continue;

              // Scan from HEADER_OFFSET (~20) for directive/pipe instances.
              // TranslatePipe instances have a "translate" property = TranslateService.
              for (let i = 20; i < lView.length && i < 200; i++) {
                if (scanInstance(lView[i])) { reloaded = true; break outer; }
              }

              // Also check the component instance directly
              if (ng?.getComponent) {
                let comp;
                try { comp = ng.getComponent(el); } catch {}
                if (comp && scanInstance(comp)) { reloaded = true; break outer; }
              }
            }
          } catch(e) {
            console.warn('[adorable] Translation service reload failed:', e);
          }
          console.log('[adorable] RELOAD_TRANSLATIONS done, reloaded:', reloaded);
          if (!reloaded) {
            window.location.reload();
          }
        }

        if (event.data.type === 'SELECT_ELEMENT') {
           // Select an element from breadcrumb navigation
           const { elementId, tagName, index } = event.data;
           let target = null;

           // Try to find by data-elements-id first
           if (elementId) {
              target = __findElementById(elementId);
           }

           // Fallback: find by walking up from currently selected element
           if (!target && selectedElement && index !== undefined) {
              // Walk up the hierarchy from selected element
              let el = selectedElement;
              const hierarchy = [];
              while (el && el !== document.body && el !== document.documentElement) {
                 hierarchy.unshift(el);
                 el = el.parentElement;
              }
              // Index is the position in the hierarchy (0 = root, last = current)
              if (index >= 0 && index < hierarchy.length) {
                 target = hierarchy[index];
              }
           }

           if (target) {
              selectedElement = target;
              showSelectionOverlay(target);

              // Gather element data and send back
              const computedStyle = window.getComputedStyle(target);
              let componentName = null;
              let hostTag = null;

              if (window.ng) {
                 let el = target;
                 while (el) {
                    let comp = window.ng.getComponent(el);
                    if (!comp) comp = window.ng.getOwningComponent(el);
                    if (comp && comp.constructor) {
                       componentName = comp.constructor.name;
                       if (componentName.startsWith('_')) componentName = componentName.substring(1);
                       let hostEl = el;
                       while(hostEl && (!hostEl.tagName.includes('-'))) {
                          hostEl = hostEl.parentElement;
                       }
                       if (hostEl) hostTag = hostEl.tagName.toLowerCase();
                       break;
                    }
                    el = el.parentElement;
                 }
              }

              // Build new hierarchy from selected element
              const newHierarchy = [];
              let hierEl = target;
              while (hierEl && hierEl !== document.body && hierEl !== document.documentElement) {
                 newHierarchy.unshift({
                    tagName: hierEl.tagName.toLowerCase(),
                    elementId: __getElementId(hierEl),
                    text: hierEl.innerText ? hierEl.innerText.substring(0, 20).trim() : '',
                    classes: hierEl.className || ''
                 });
                 hierEl = hierEl.parentElement;
              }

              window.parent.postMessage({
                 type: 'ELEMENT_SELECTED',
                 payload: {
                    tagName: target.tagName.toLowerCase(),
                    text: target.innerText ? target.innerText.substring(0, 100).trim() : '',
                    componentName: componentName,
                    hostTag: hostTag,
                    elementId: __getElementId(target),
                    ongAnnotation: __getOngAnnotation(target),
                    classes: target.className,
                    hierarchy: newHierarchy,
                    attributes: {
                       id: target.id,
                       type: target.getAttribute('type')
                    },
                    styles: {
                       color: computedStyle.color,
                       backgroundColor: computedStyle.backgroundColor,
                       fontSize: computedStyle.fontSize,
                       fontWeight: computedStyle.fontWeight,
                       textAlign: computedStyle.textAlign,
                       marginTop: computedStyle.marginTop,
                       marginRight: computedStyle.marginRight,
                       marginBottom: computedStyle.marginBottom,
                       marginLeft: computedStyle.marginLeft,
                       paddingTop: computedStyle.paddingTop,
                       paddingRight: computedStyle.paddingRight,
                       paddingBottom: computedStyle.paddingBottom,
                       paddingLeft: computedStyle.paddingLeft,
                       borderRadius: computedStyle.borderRadius,
                       display: computedStyle.display,
                       flexDirection: computedStyle.flexDirection,
                       justifyContent: computedStyle.justifyContent,
                       alignItems: computedStyle.alignItems,
                       gap: computedStyle.gap
                    }
                 }
              }, '*');
           }
        }
      });

      // Inspector Events
      document.addEventListener('mouseover', (e) => {
        if (!active) return;
        const target = e.target;
        const overlayEl = document.getElementById('inspector-overlay');
        if (!overlayEl || target === overlayEl || target === document.body || target === document.documentElement) return;

        const rect = target.getBoundingClientRect();
        overlayEl.style.top = rect.top + 'px';
        overlayEl.style.left = rect.left + 'px';
        overlayEl.style.width = rect.width + 'px';
        overlayEl.style.height = rect.height + 'px';
        overlayEl.style.display = 'block';
      });

      // Hide inspector hover overlay when mouse leaves the preview window
      document.addEventListener('mouseleave', () => {
        const overlayEl = document.getElementById('inspector-overlay');
        if (overlayEl) overlayEl.style.display = 'none';
      });

      document.addEventListener('click', (e) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();

        // Delay click processing to allow double-click to cancel it
        pendingClickEvent = e;
        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          if (!pendingClickEvent) return; // Was cancelled by dblclick
          processClick(pendingClickEvent);
          pendingClickEvent = null;
        }, 250);
      });

      function processClick(e) {
        const target = e.target;
        let componentName = null;
        let hostTag = null;

        // Attempt to find Angular Component and its Host Tag
        if (window.ng) {
           let el = target;
           while (el) {
              let comp = window.ng.getComponent(el);
              if (!comp) comp = window.ng.getOwningComponent(el);

              if (comp && comp.constructor) {
                 componentName = comp.constructor.name;
                 // Strip leading underscores (common in build artifacts)
                 if (componentName.startsWith('_')) {
                    componentName = componentName.substring(1);
                 }

                 // If we found the component, the element itself or its nearest custom parent is the host
                 let hostEl = el;
                 while(hostEl && (!hostEl.tagName.includes('-'))) {
                    hostEl = hostEl.parentElement;
                 }
                 if (hostEl) hostTag = hostEl.tagName.toLowerCase();

                 break;
              }
              el = el.parentElement;
           }
        }

        // Fallback: Find nearest custom element (tag with dash)
        if (!componentName) {
           let el = target;
           while (el && el.tagName) {
              if (el.tagName.includes('-')) {
                 hostTag = el.tagName.toLowerCase();
                 break;
              }
              el = el.parentElement;
           }

           if (!hostTag) {
              console.warn('[Inspector] Failed to find component or host tag for', target);
              if (document.querySelector('app-root')) {
                 componentName = 'AppComponent';
                 hostTag = 'app-root';
              }
           }
        }

        const computedStyle = window.getComputedStyle(target);

        // Capture data-elements-id for reliable visual editing
        const elementId = __getElementId(target);

        // Calculate child index among siblings of same tag
        let childIndex = 0;
        if (target.parentNode) {
           const siblings = Array.from(target.parentNode.children);
           const sameTagSiblings = siblings.filter(s => s.tagName === target.tagName);
           childIndex = sameTagSiblings.indexOf(target);
        }

        // Build element hierarchy for breadcrumb navigation
        const hierarchy = [];
        let el = target;
        while (el && el !== document.body && el !== document.documentElement) {
           hierarchy.unshift({
              tagName: el.tagName.toLowerCase(),
              elementId: __getElementId(el),
              text: el.innerText ? el.innerText.substring(0, 20).trim() : '',
              classes: el.className || ''
           });
           el = el.parentElement;
        }

        // Show persistent selection overlay
        showSelectionOverlay(target);

        window.parent.postMessage({
          type: 'ELEMENT_SELECTED',
          payload: {
            tagName: target.tagName.toLowerCase(),
            text: target.innerText ? target.innerText.substring(0, 100).trim() : '',
            componentName: componentName,
            hostTag: hostTag,
            elementId: elementId,
            ongAnnotation: __getOngAnnotation(target),
            childIndex: childIndex,
            parentTag: target.parentNode ? target.parentNode.tagName.toLowerCase() : null,
            classes: target.className,
            hierarchy: hierarchy,
            attributes: {
               id: target.id,
               type: target.getAttribute('type')
            },
            styles: {
                // Colors
                color: computedStyle.color,
                backgroundColor: computedStyle.backgroundColor,
                // Typography
                fontSize: computedStyle.fontSize,
                fontWeight: computedStyle.fontWeight,
                textAlign: computedStyle.textAlign,
                lineHeight: computedStyle.lineHeight,
                // Spacing
                padding: computedStyle.padding,
                paddingTop: computedStyle.paddingTop,
                paddingRight: computedStyle.paddingRight,
                paddingBottom: computedStyle.paddingBottom,
                paddingLeft: computedStyle.paddingLeft,
                margin: computedStyle.margin,
                marginTop: computedStyle.marginTop,
                marginRight: computedStyle.marginRight,
                marginBottom: computedStyle.marginBottom,
                marginLeft: computedStyle.marginLeft,
                // Border
                borderRadius: computedStyle.borderRadius,
                borderWidth: computedStyle.borderWidth,
                borderColor: computedStyle.borderColor,
                borderStyle: computedStyle.borderStyle,
                // Layout (for containers)
                display: computedStyle.display,
                flexDirection: computedStyle.flexDirection,
                justifyContent: computedStyle.justifyContent,
                alignItems: computedStyle.alignItems,
                gap: computedStyle.gap,
                flexWrap: computedStyle.flexWrap
            }
          }
        }, '*');

        // Keep inspector active - don't set active = false
        // User can toggle it off with the inspect button
      }

      // In-place text editing (double-click)
      document.addEventListener('dblclick', (e) => {
        // Cancel the pending single-click
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }
        pendingClickEvent = null;

        if (!active) return;
        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        const text = target.textContent?.trim();

        // Only allow on text-containing elements without child elements
        if (!text || target.children.length > 0) return;

        // Store original text for cancel
        const originalText = target.textContent;
        const elementId = __getElementId(target);

        // Build fingerprint for the element
        let componentName = null;
        let hostTag = null;
        if (window.ng) {
           let el = target;
           while (el) {
              let comp = window.ng.getComponent(el);
              if (!comp) comp = window.ng.getOwningComponent(el);
              if (comp && comp.constructor) {
                 componentName = comp.constructor.name;
                 if (componentName.startsWith('_')) componentName = componentName.substring(1);
                 let hostEl = el;
                 while(hostEl && (!hostEl.tagName.includes('-'))) hostEl = hostEl.parentElement;
                 if (hostEl) hostTag = hostEl.tagName.toLowerCase();
                 break;
              }
              el = el.parentElement;
           }
        }

        // Make editable
        target.setAttribute('contenteditable', 'true');
        target.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(target);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);

        // Style to show editing mode
        target.style.outline = '2px solid #3ecf8e';
        target.style.outlineOffset = '2px';
        target.style.borderRadius = '2px';

        // Save function
        const save = () => {
          target.removeAttribute('contenteditable');
          target.style.outline = '';
          target.style.outlineOffset = '';
          target.style.borderRadius = '';

          const newText = target.textContent?.trim();
          if (newText && newText !== originalText.trim()) {
            window.parent.postMessage({
              type: 'INLINE_TEXT_EDIT',
              payload: {
                tagName: target.tagName.toLowerCase(),
                text: originalText,
                newText: newText,
                elementId: elementId,
                ongAnnotation: __getOngAnnotation(target),
                componentName: componentName,
                hostTag: hostTag,
                classes: target.className,
                attributes: { id: target.id }
              }
            }, '*');
          }
        };

        target.addEventListener('blur', save, { once: true });
        target.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter' && !evt.shiftKey) {
            evt.preventDefault();
            target.blur();
          }
          if (evt.key === 'Escape') {
            target.textContent = originalText;
            target.blur();
          }
        });

        // Hide overlay during editing
        const overlayEl = document.getElementById('inspector-overlay');
        if (overlayEl) overlayEl.style.display = 'none';
      });
    })();

    // Multi-Annotation Tool — lets users click multiple elements and annotate each one
    (function() {
      let multiActive = false;
      let nextIndex = 1;
      const items = new Map(); // index -> { element, badge, elementId, note }

      function getElementData(target) {
        let componentName = null;
        let hostTag = null;
        if (window.ng) {
          let el = target;
          while (el) {
            let comp = window.ng.getComponent(el);
            if (!comp) comp = window.ng.getOwningComponent(el);
            if (comp && comp.constructor) {
              componentName = comp.constructor.name;
              if (componentName.startsWith('_')) componentName = componentName.substring(1);
              let hostEl = el;
              while (hostEl && !hostEl.tagName.includes('-')) hostEl = hostEl.parentElement;
              if (hostEl) hostTag = hostEl.tagName.toLowerCase();
              break;
            }
            el = el.parentElement;
          }
        }
        return {
          tagName: target.tagName.toLowerCase(),
          text: target.innerText ? target.innerText.substring(0, 100).trim() : '',
          componentName: componentName,
          hostTag: hostTag,
          elementId: __getElementId(target),
          ongAnnotation: __getOngAnnotation(target),
          classes: target.className || '',
          attributes: { id: target.id, type: target.getAttribute('type') }
        };
      }

      function createBadge(index, element) {
        const badge = document.createElement('div');
        badge.className = '__multi-ann-badge';
        badge.dataset.multiAnnIndex = String(index);
        badge.textContent = String(index);
        badge.style.cssText = 'position:fixed;z-index:1000000;width:22px;height:22px;border-radius:50%;' +
          'background:#6366f1;color:#fff;font-size:11px;font-weight:700;font-family:system-ui,sans-serif;' +
          'display:flex;align-items:center;justify-content:center;cursor:pointer;' +
          'box-shadow:0 1px 4px rgba(0,0,0,0.3);pointer-events:auto;transition:background 0.2s;';

        // Tooltip
        const tooltip = document.createElement('div');
        tooltip.className = '__multi-ann-tooltip';
        tooltip.textContent = 'No note yet';
        tooltip.style.cssText = 'position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);' +
          'background:#1e1e2e;color:#cdd6f4;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:400;' +
          'white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;' +
          'opacity:0;transition:opacity 0.15s;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        badge.appendChild(tooltip);

        badge.addEventListener('mouseenter', () => { tooltip.style.opacity = '1'; });
        badge.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });

        badge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({ type: 'MULTI_ANNOTATION_CLICKED', index: index }, '*');
        });

        document.body.appendChild(badge);
        return badge;
      }

      function positionBadge(badge, element) {
        const rect = element.getBoundingClientRect();
        badge.style.top = (rect.top - 4) + 'px';
        badge.style.left = (rect.right - 10) + 'px';
      }

      function updateAllBadgePositions() {
        items.forEach((item) => {
          if (!document.body.contains(item.element) && item.elementId) {
            const found = __findElementById(item.elementId);
            if (found) {
              item.element = found;
              item.element.style.outline = '2px dashed #6366f1';
              item.element.style.outlineOffset = '2px';
            }
          }
          if (document.body.contains(item.element)) {
            positionBadge(item.badge, item.element);
          }
        });
      }

      function addElement(target) {
        // Check if already annotated
        for (const [, item] of items) {
          if (item.element === target) return;
          if (item.elementId && item.elementId === __getElementId(target)) return;
        }

        const index = nextIndex++;
        const badge = createBadge(index, target);
        positionBadge(badge, target);

        // Outline on the element
        target.style.outline = '2px dashed #6366f1';
        target.style.outlineOffset = '2px';

        const elementId = __getElementId(target);
        items.set(index, { element: target, badge: badge, elementId: elementId, note: '' });

        const data = getElementData(target);
        window.parent.postMessage({
          type: 'MULTI_ELEMENT_ADDED',
          payload: { ...data, index: index }
        }, '*');
      }

      function removeItem(index) {
        const item = items.get(index);
        if (!item) return;
        item.badge.remove();
        if (document.body.contains(item.element)) {
          item.element.style.outline = '';
          item.element.style.outlineOffset = '';
        }
        items.delete(index);
      }

      function hideAll() {
        items.forEach((item) => {
          item.badge.style.display = 'none';
          if (document.body.contains(item.element)) {
            item.element.style.outline = '';
            item.element.style.outlineOffset = '';
          }
        });
      }

      function showAll() {
        items.forEach((item) => {
          item.badge.style.display = 'flex';
          if (document.body.contains(item.element)) {
            item.element.style.outline = '2px dashed #6366f1';
            item.element.style.outlineOffset = '2px';
          }
        });
        updateAllBadgePositions();
      }

      function clearAll() {
        items.forEach((item) => {
          item.badge.remove();
          if (document.body.contains(item.element)) {
            item.element.style.outline = '';
            item.element.style.outlineOffset = '';
          }
        });
        items.clear();
        nextIndex = 1;
      }

      // Scroll/resize tracking
      let rafPending = false;
      function schedulePositionUpdate() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          updateAllBadgePositions();
        });
      }
      window.addEventListener('scroll', schedulePositionUpdate, true);
      window.addEventListener('resize', schedulePositionUpdate);

      // MutationObserver to reposition after DOM changes (HMR etc.)
      let multiDomObserver = null;
      function startMultiObserver() {
        if (multiDomObserver) return;
        multiDomObserver = new MutationObserver(schedulePositionUpdate);
        multiDomObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
      }
      function stopMultiObserver() {
        if (multiDomObserver) { multiDomObserver.disconnect(); multiDomObserver = null; }
      }

      // Click handler for multi-annotate mode
      function onMultiClick(e) {
        if (!multiActive) return;
        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        if (!target || target === document.body || target === document.documentElement) return;
        // Ignore clicks on badges
        if (target.closest && target.closest('.__multi-ann-badge')) return;

        addElement(target);
      }

      // Hover overlay for multi-annotate
      let multiHoverOverlay = null;
      function ensureMultiHoverOverlay() {
        if (document.getElementById('__multi-ann-hover')) return;
        multiHoverOverlay = document.createElement('div');
        multiHoverOverlay.id = '__multi-ann-hover';
        multiHoverOverlay.style.cssText = 'position:fixed;border:2px solid #6366f1;background:transparent;' +
          'z-index:999998;pointer-events:none;display:none;border-radius:2px;';
        document.body.appendChild(multiHoverOverlay);
      }

      function onMultiHover(e) {
        if (!multiActive) return;
        const target = e.target;
        if (!multiHoverOverlay || !target || target === document.body || target === document.documentElement) return;
        if (target.closest && target.closest('.__multi-ann-badge')) {
          multiHoverOverlay.style.display = 'none';
          return;
        }
        const rect = target.getBoundingClientRect();
        multiHoverOverlay.style.top = rect.top + 'px';
        multiHoverOverlay.style.left = rect.left + 'px';
        multiHoverOverlay.style.width = rect.width + 'px';
        multiHoverOverlay.style.height = rect.height + 'px';
        multiHoverOverlay.style.display = 'block';
      }

      document.addEventListener('click', onMultiClick, true);
      document.addEventListener('mouseover', onMultiHover);
      document.addEventListener('mouseleave', () => {
        if (multiHoverOverlay) multiHoverOverlay.style.display = 'none';
      });

      window.addEventListener('message', (event) => {
        if (event.data.type === 'TOGGLE_MULTI_ANNOTATOR') {
          multiActive = event.data.enabled;
          if (multiActive) {
            ensureMultiHoverOverlay();
            startMultiObserver();
            showAll();
          } else {
            if (multiHoverOverlay) multiHoverOverlay.style.display = 'none';
            stopMultiObserver();
            hideAll();
          }
        }

        if (event.data.type === 'MULTI_ANNOTATE_REMOVE') {
          removeItem(event.data.index);
        }

        if (event.data.type === 'MULTI_ANNOTATE_CLEAR') {
          clearAll();
        }

        if (event.data.type === 'MULTI_ANNOTATE_UPDATE_NOTE') {
          const item = items.get(event.data.index);
          if (item) {
            item.note = event.data.note || '';
            const badge = item.badge;
            const tooltip = badge.querySelector('.__multi-ann-tooltip');
            if (tooltip) {
              tooltip.textContent = item.note || 'No note yet';
            }
            // Visual indicator: filled when note exists
            if (item.note) {
              badge.style.background = '#4f46e5';
              badge.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.4), 0 1px 4px rgba(0,0,0,0.3)';
            } else {
              badge.style.background = '#6366f1';
              badge.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
            }
          }
        }
      });
    })();

    // Screenshot logic — html2canvas only (fast native capture handled by ScreenshotService)
    (function() {
      window.addEventListener('message', async (event) => {
        if (event.data.type === 'CAPTURE_REQ') {
          const { x, y, width, height } = event.data.rect;

          try {
            if (!window.html2canvas) {
              console.warn('[Runtime] html2canvas not available');
              window.parent.postMessage({ type: 'CAPTURE_RES', image: null }, '*');
              return;
            }

            const canvas = await window.html2canvas(document.body, {
              x: x,
              y: y,
              width: width,
              height: height,
              scale: 0.5,
              useCORS: true,
              allowTaint: true,
              logging: false
            });
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            window.parent.postMessage({ type: 'CAPTURE_RES', image: dataUrl }, '*');
          } catch (err) {
            console.error('[Runtime] Screenshot capture failed:', err);
            window.parent.postMessage({ type: 'CAPTURE_RES', image: null }, '*');
          }
        }
      });
    })();
  </script>
`;
