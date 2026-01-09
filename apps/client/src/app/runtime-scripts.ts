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
        
        // Attempt to find Angular Component
        if (window.ng) {
           let comp = window.ng.getComponent(target);
           if (!comp) comp = window.ng.getOwningComponent(target);
           
           if (comp && comp.constructor) {
              componentName = comp.constructor.name;
           }
        }

        const computedStyle = window.getComputedStyle(target);
        
        window.parent.postMessage({
          type: 'ELEMENT_SELECTED',
          payload: {
            tagName: target.tagName.toLowerCase(),
            text: target.innerText ? target.innerText.substring(0, 100) : '',
            componentName: componentName,
            classes: target.className,
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
    window.addEventListener('message', async (event) => {
      if (event.data.type === 'CAPTURE_REQ') {
        const { x, y, width, height } = event.data.rect;
        try {
          if (typeof html2canvas === 'undefined') throw new Error('html2canvas not loaded');
          const canvas = await html2canvas(document.body, { x, y, width, height, useCORS: true, logging: false });
          window.parent.postMessage({ type: 'CAPTURE_RES', image: canvas.toDataURL('image/png') }, '*');
        } catch (err) { console.error(err); }
      }
    });
  </script>
`;
