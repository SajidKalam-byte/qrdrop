import type { Conn, ServerEvent } from '../types';

interface Handlers {
  onEvent: (e: ServerEvent) => void;
  onOpen: () => void;
  /** Socket closed; `everOpened` is false when the very first attempt failed (auth or unreachable). */
  onClose: (everOpened: boolean) => void;
}

/** WebSocket that reconnects with backoff until stop() is called. */
export function startSocket(conn: Conn, h: Handlers): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = 500;
  let everOpened = false;

  const open = () => {
    ws = new WebSocket(`ws://${conn.host}:${conn.port}/ws?token=${encodeURIComponent(conn.bearer)}`);
    ws.onopen = () => {
      everOpened = true;
      delay = 500;
      h.onOpen();
    };
    ws.onmessage = (m) => {
      try {
        h.onEvent(JSON.parse(String(m.data)));
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (stopped) return;
      h.onClose(everOpened);
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, 5000);
    };
  };
  open();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
