// Background service worker — captures the visible tab when requested by content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CAPTURE_TAB' || !sender.tab) return false;

  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
    .then((dataUrl) => sendResponse({ dataUrl }))
    .catch((err) => {
      console.error('[Adorable Screenshot] captureVisibleTab failed:', err);
      sendResponse({ dataUrl: null });
    });

  // Return true to indicate we will call sendResponse asynchronously
  return true;
});
