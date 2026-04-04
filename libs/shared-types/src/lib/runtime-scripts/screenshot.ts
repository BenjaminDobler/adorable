/// <reference path="./types.d.ts" />

// Screenshot logic — html2canvas only (fast native capture handled by ScreenshotService)
(function () {
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.data.type === 'CAPTURE_REQ') {
      const { x, y, width, height } = event.data.rect as { x: number; y: number; width: number; height: number };

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
