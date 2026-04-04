// Storage Settings Loader — applies localStorage/cookie presets before the app bootstraps
(function () {
  const agentUrl = 'http://localhost:' + ((window as any).__adorable_agent_port || '3334');
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', agentUrl + '/api/native/storage-settings', false); // synchronous
    xhr.send();
    if (xhr.status === 200) {
      const settings = JSON.parse(xhr.responseText);
      if (settings.localStorage) {
        Object.keys(settings.localStorage).forEach(function (key) {
          localStorage.setItem(key, settings.localStorage[key]);
        });
      }
      if (settings.cookies) {
        Object.keys(settings.cookies).forEach(function (key) {
          document.cookie = key + '=' + encodeURIComponent(settings.cookies[key]) + '; path=/';
        });
      }
    }
  } catch (e) {
    /* agent not available — skip */
  }
})();
