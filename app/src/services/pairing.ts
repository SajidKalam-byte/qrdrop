import type { Conn } from '../types';
import { fetchWithTimeout } from './api';

const PAIR_URL = /^http:\/\/([^/:\s]+):(\d{1,5})\/s\/([\w-]+)\/?$/;

export function parsePairUrl(data: string): { host: string; port: number; token: string } | null {
  const m = PAIR_URL.exec(data.trim());
  return m ? { host: m[1], port: Number(m[2]), token: m[3] } : null;
}

/** Scan -> GET /s/<token> -> bearer. Throws a user-readable Error. */
export async function pair(qrData: string): Promise<Conn> {
  const p = parsePairUrl(qrData);
  if (!p) throw new Error('That is not a qrdrop QR code');
  let res: Response;
  try {
    res = await fetchWithTimeout(`http://${p.host}:${p.port}/s/${p.token}`, { headers: { Accept: 'application/json' } }, 4000);
  } catch {
    throw new Error("Can't reach your computer. Same Wi-Fi? Firewall or guest-network isolation can block it.");
  }
  if (res.status === 401) throw new Error('QR code expired - scan the fresh one on the computer');
  if (!res.ok) throw new Error(`Computer refused the connection (${res.status})`);
  const j = await res.json();
  return { host: p.host, port: p.port, bearer: j.bearer, sessionId: j.session_id, expiresAt: j.expires_at };
}
