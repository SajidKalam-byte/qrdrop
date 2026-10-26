import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';

import { AuthError, api, fetchWithTimeout, authHeader, baseUrl } from '../services/api';
import { pair } from '../services/pairing';
import { startSocket } from '../services/ws';
import { clearConn, loadConn, saveAddress, saveConn } from '../storage/secureStore';
import type { Conn, Item, ServerEvent, Status } from '../types';

interface SessionCtx {
  conn: Conn | null;
  status: Status;
  items: Item[];
  error: string | null;
  /** Number of in-flight uploads/downloads (used to keep the screen awake). */
  busy: number;
  connectFromQr: (data: string, onStep?: (m: string) => void) => Promise<void>;
  disconnect: () => Promise<void>;
  track: <T>(p: Promise<T>) => Promise<T>;
  clearError: () => void;
  setError: (m: string) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

function applyEvent(prev: Item[], e: ServerEvent): Item[] {
  switch (e.type) {
    case 'snapshot':
      return e.items;
    case 'item_added':
    case 'item_updated':
    case 'text_added':
      return [e.item, ...prev.filter((i) => i.id !== e.item.id)].sort((a, b) => b.created_at - a.created_at);
    case 'item_removed':
      return prev.filter((i) => i.id !== e.id);
    case 'wiped':
      return [];
    default:
      return prev;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [conn, setConn] = useState<Conn | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const connRef = useRef<Conn | null>(null);

  const drop = useCallback(async (msg?: string) => {
    connRef.current = null;
    setConn(null);
    setItems([]);
    setStatus('idle');
    await clearConn();
    if (msg) setError(msg);
  }, []);

  // Fast path on launch: silently retry the last server; the camera is already live meanwhile.
  useEffect(() => {
    (async () => {
      const saved = await loadConn();
      if (!saved) return;
      setStatus('connecting');
      try {
        const r = await fetchWithTimeout(`${baseUrl(saved)}/api/info`, { headers: authHeader(saved) }, 2000);
        if (r.ok) {
          connRef.current = saved;
          setConn(saved);
          return;
        }
      } catch {}
      setStatus('idle');
      await clearConn();
    })();
  }, []);

  // Live feed while we hold a connection.
  useEffect(() => {
    if (!conn) return;
    return startSocket(conn, {
      onOpen: () => setStatus('connected'),
      onEvent: (e) => setItems((prev) => applyEvent(prev, e)),
      onClose: async (everOpened) => {
        setStatus('lost');
        // distinguish "network blip" from "token dead / wiped"
        try {
          await api(conn, '/api/info', {}, 2500);
        } catch (err) {
          if (err instanceof AuthError) await drop(everOpened ? 'Session ended - scan the QR code again' : undefined);
        }
      },
    });
  }, [conn, drop]);

  const connectFromQr = useCallback(async (data: string, onStep?: (m: string) => void) => {
    setError(null);
    setStatus('connecting');
    try {
      const c = await pair(data, onStep);
      await saveConn(c);
      await saveAddress(`${c.host}:${c.port}`);
      connRef.current = c;
      setConn(c);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const track = useCallback(async <T,>(p: Promise<T>) => {
    setBusy((n) => n + 1);
    try {
      return await p;
    } finally {
      setBusy((n) => n - 1);
    }
  }, []);

  const value = useMemo<SessionCtx>(
    () => ({
      conn, status, items, error, busy, connectFromQr, track,
      disconnect: () => drop(),
      clearError: () => setError(null),
      setError,
    }),
    [conn, status, items, error, busy, connectFromQr, track, drop],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
