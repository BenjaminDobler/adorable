// Console Interceptor — only active in iframe mode (window.parent !== window).
// In Electron webview mode window.parent === window, so postMessage would loop back;
// webview console output is captured natively via the console-message event instead.
(function () {
  if (window.parent === window) return;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  function send(type: string, args: any[]) {
    const message = args
      .map((arg) => {
        try {
          return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch (e) {
          return String(arg);
        }
      })
      .join(' ');
    window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: type, message }, '*');
  }

  console.log = function (...args: any[]) {
    originalLog.apply(console, args);
    send('log', args);
  };
  console.warn = function (...args: any[]) {
    originalWarn.apply(console, args);
    send('warn', args);
  };
  console.error = function (...args: any[]) {
    originalError.apply(console, args);
    send('error', args);
  };
})();
