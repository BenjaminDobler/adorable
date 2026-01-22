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

      window.addEventListener('message', (event) => {
        if (event.data.type === 'TOGGLE_INSPECTOR') {
          active = event.data.enabled;
          createOverlay();
          if (!active && overlay) overlay.style.display = 'none';
        }
        
        if (event.data.type === 'RELOAD_REQ') {
           window.location.reload();
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
        
        // Calculate child index among siblings of same tag
        let childIndex = 0;
        if (target.parentNode) {
           const siblings = Array.from(target.parentNode.children);
           const sameTagSiblings = siblings.filter(s => s.tagName === target.tagName);
           childIndex = sameTagSiblings.indexOf(target);
        }
        
        window.parent.postMessage({
          type: 'ELEMENT_SELECTED',
          payload: {
            tagName: target.tagName.toLowerCase(),
            text: target.innerText ? target.innerText.substring(0, 100).trim() : '',
            componentName: componentName,
            hostTag: hostTag,
            childIndex: childIndex,
            parentTag: target.parentNode ? target.parentNode.tagName.toLowerCase() : null,
            classes: target.className,
            attributes: {
               id: target.id,
               type: target.getAttribute('type')
            },
            styles: {
                color: computedStyle.color,
                backgroundColor: computedStyle.backgroundColor,
                borderRadius: computedStyle.borderRadius,
                fontSize: computedStyle.fontSize,
                padding: computedStyle.padding,
                margin: computedStyle.margin
            }
          }
        }, '*');
        
        active = false;
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
