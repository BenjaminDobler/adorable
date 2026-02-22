// Content script (ISOLATED world) — bridges postMessage from the page
// to the background service worker for captureVisibleTab.

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== 'ADORABLE_SCREENSHOT_REQ') return;

  console.log('[Adorable Extension] Content script received ADORABLE_SCREENSHOT_REQ');
  const { rect, devicePixelRatio } = event.data;

  chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Adorable Extension] runtime.sendMessage error:', chrome.runtime.lastError.message);
      window.postMessage({ type: 'ADORABLE_SCREENSHOT_RES', image: null }, '*');
      return;
    }

    if (!response || !response.dataUrl) {
      console.warn('[Adorable Extension] No dataUrl in response', response);
      window.postMessage({ type: 'ADORABLE_SCREENSHOT_RES', image: null }, '*');
      return;
    }

    console.log('[Adorable Extension] Got tab capture, cropping...');

    // Crop the full-tab screenshot to the requested rect
    const img = new Image();
    img.onload = () => {
      const dpr = devicePixelRatio || 1;
      const cropX = Math.round(rect.x * dpr);
      const cropY = Math.round(rect.y * dpr);
      const cropW = Math.round(rect.width * dpr);
      const cropH = Math.round(rect.height * dpr);

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      console.log('[Adorable Extension] Crop complete, sending response');
      window.postMessage({
        type: 'ADORABLE_SCREENSHOT_RES',
        image: canvas.toDataURL('image/jpeg', 0.8)
      }, '*');
    };
    img.onerror = () => {
      console.error('[Adorable Extension] Failed to load captured image');
      window.postMessage({ type: 'ADORABLE_SCREENSHOT_RES', image: null }, '*');
    };
    img.src = response.dataUrl;
  });
});
