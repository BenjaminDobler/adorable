// Route Change Tracker — reports the current URL path to the host whenever navigation occurs.
// Works with Angular Router (popstate + pushState/replaceState) and hash-based routing.
(function () {
  let lastPath = '';
  function reportRoute() {
    const p = location.pathname + location.hash;
    if (p !== lastPath) {
      lastPath = p;
      const msg = { type: 'PREVIEW_ROUTE_CHANGE', route: p };
      // Always use postMessage — in an iframe window.parent is the host,
      // in a webview window.parent === window so this dispatches locally
      // and the bridge listener forwards it via console.debug IPC.
      window.parent.postMessage(msg, '*');
    }
  }
  // Patch pushState/replaceState to detect programmatic navigation
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args: any[]) {
    origPush.apply(this, args as any);
    reportRoute();
  };
  history.replaceState = function (...args: any[]) {
    origReplace.apply(this, args as any);
    reportRoute();
  };
  window.addEventListener('popstate', reportRoute);
  // Report initial route once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportRoute);
  } else {
    reportRoute();
  }
})();
