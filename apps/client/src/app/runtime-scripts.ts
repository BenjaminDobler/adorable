export const RUNTIME_SCRIPTS = `
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
    // Console Interceptor
    (function() {
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
        overlay.style.border = '2px solid #3ecf8e'; // Angular Green
        overlay.style.backgroundColor = 'rgba(62, 207, 142, 0.2)';
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'none';
        overlay.style.transition = 'all 0.1s ease';
        document.body.appendChild(overlay);
      }

      function createSelectionOverlay() {
        if (document.getElementById('inspector-selection')) return;
        selectionOverlay = document.createElement('div');
        selectionOverlay.id = 'inspector-selection';
        selectionOverlay.style.position = 'fixed';
        selectionOverlay.style.border = '2px solid #3ecf8e';
        selectionOverlay.style.backgroundColor = 'rgba(62, 207, 142, 0.1)';
        selectionOverlay.style.zIndex = '999998';
        selectionOverlay.style.pointerEvents = 'none';
        selectionOverlay.style.display = 'none';
        selectionOverlay.style.boxShadow = '0 0 0 4px rgba(62, 207, 142, 0.2)';
        document.body.appendChild(selectionOverlay);

        // Add a label to show element info
        const label = document.createElement('div');
        label.id = 'inspector-selection-label';
        label.style.position = 'absolute';
        label.style.top = '-24px';
        label.style.left = '0';
        label.style.background = '#3ecf8e';
        label.style.color = '#000';
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
      }

      function hideSelectionOverlay() {
        const sel = document.getElementById('inspector-selection');
        if (sel) sel.style.display = 'none';
        selectedElement = null;
      }

      // Update selection position on scroll/resize
      function updateSelectionPosition() {
        if (!selectedElement) return;
        const sel = document.getElementById('inspector-selection');
        if (!sel || sel.style.display === 'none') return;

        const rect = selectedElement.getBoundingClientRect();
        sel.style.top = rect.top + 'px';
        sel.style.left = rect.left + 'px';
        sel.style.width = rect.width + 'px';
        sel.style.height = rect.height + 'px';
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

        if (event.data.type === 'SELECT_ELEMENT') {
           // Select an element from breadcrumb navigation
           const { elementId, tagName, index } = event.data;
           let target = null;

           // Try to find by data-elements-id first
           if (elementId) {
              target = document.querySelector('[data-elements-id="' + elementId + '"]');
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
                    elementId: hierEl.getAttribute('data-elements-id') || null,
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
                    elementId: target.getAttribute('data-elements-id'),
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
        const elementId = target.getAttribute('data-elements-id');

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
              elementId: el.getAttribute('data-elements-id') || null,
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
        const elementId = target.getAttribute('data-elements-id');

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
    
    // Screenshot logic
    (function() {
      let domToCanvas;
      
      console.log('[Runtime] Initializing screenshot logic...');

      // Load modern-screenshot dynamically as an ES module
      import('https://cdn.jsdelivr.net/npm/modern-screenshot/+esm').then(mod => {
        domToCanvas = mod.domToCanvas;
        console.log('[Runtime] modern-screenshot loaded successfully');
      }).catch(err => console.error('[Runtime] Failed to load modern-screenshot', err));

      window.addEventListener('message', async (event) => {
        if (event.data.type === 'CAPTURE_REQ') {
          console.log('[Runtime] Received CAPTURE_REQ', event.data.rect);
          const { x, y, width, height } = event.data.rect;
          if (!domToCanvas) {
             console.warn('[Runtime] modern-screenshot not loaded yet');
             return;
          }

          try {
            console.log('[Runtime] Capturing screenshot...');
            let dataUrl;

            try {
              // Primary method: modern-screenshot
              const canvas = await domToCanvas(document.body, {
                width: width,
                height: height,
                scale: 0.5,
                features: { copyCSSStyles: true },
                style: {
                  transform: 'translate(-' + x + 'px, -' + y + 'px)',
                  transformOrigin: 'top left'
                }
              });
              dataUrl = canvas.toDataURL('image/png');
            } catch (modernErr) {
              console.warn('[Runtime] modern-screenshot failed, falling back to html2canvas', modernErr);
              if (window.html2canvas) {
                const canvas = await window.html2canvas(document.body, {
                  x: x,
                  y: y,
                  width: width,
                  height: height,
                  scale: 1,
                  useCORS: true,
                  allowTaint: true,
                  logging: true
                });
                dataUrl = canvas.toDataURL('image/png');
              } else {
                throw modernErr;
              }
            }
            
            console.log('[Runtime] Screenshot captured successfully');
            window.parent.postMessage({ 
              type: 'CAPTURE_RES', 
              image: dataUrl 
            }, '*');
          } catch (err) { 
            console.error('[Runtime] All screenshot methods failed:', err); 
          }
        }
      });
    })();
  </script>
`;
