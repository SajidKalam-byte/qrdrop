/* WebSocket with auto-reconnect. Emits server events to a single handler. */
(function () {
  function connect(onEvent, onState) {
    let retry = 500;
    let timer = null;

    function open() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => { retry = 500; onState(true); };
      ws.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch (_) {} };
      ws.onclose = () => {
        onState(false);
        clearTimeout(timer);
        timer = setTimeout(open, retry);
        retry = Math.min(retry * 2, 5000);
      };
      ws.onerror = () => ws.close();
    }
    open();
  }
  window.QrWs = { connect };
})();
