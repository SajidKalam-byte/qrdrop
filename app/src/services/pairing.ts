import type { Conn } from '../types';
import { fetchWithTimeout } from './api';

const PAIR_URL = /^http:\/\/([^/:\s]+):(\d{1,5})\/s\/([\w-]+)\/?$/;

/** Accepts the QR payload or a pasted pair link (also tolerates a missing "http://"). */
export function parsePairUrl(data: string): { host: string; port: number; token: string } | null {
  const t = data.trim();
  const m = PAIR_URL.exec(/^https?:\/\//i.test(t) ? t.replace(/^https:/i, 'http:') : `http://${t}`);
  return m ? { host: m[1], port: Number(m[2]), token: m[3] } : null;
}

/** Scan -> GET /s/<token> -> bearer. Throws an Error whose message says exactly what failed. */
export async function pair(qrData: string, onStep?: (msg: string) => void): Promise<Conn> {
  const p = parsePairUrl(qrData);
  if (!p) throw new Error(`Not a qrdrop QR code (read: "${qrData.slice(0, 60)}")`);
  const target = `${p.host}:${p.port}`;
  onStep?.(`QR read. Connecting to ${target}…`);
  let res: Response;
  try {
    res = await fetchWithTimeout(`http://${target}/s/${p.token}`, { headers: { Accept: 'application/json' } }, 6000);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(
      `QR read OK, but ${target} is not reachable (${why}). Phone and computer must be on the same Wi-Fi, ` +
        `with mobile data off if Wi-Fi has no internet, and no guest/AP isolation or firewall block.`,
    );
  }
  if (res.status === 401) throw new Error('QR code expired - scan the fresh one on the computer');
  if (!res.ok) throw new Error(`Computer refused the connection (${res.status})`);
  const j = await res.json();
  return { host: p.host, port: p.port, bearer: j.bearer, sessionId: j.session_id, expiresAt: j.expires_at };
}
