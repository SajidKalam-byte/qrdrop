import type { Conn } from '../types';

/** Thrown when the server says our bearer is missing, expired, or wiped. */
export class AuthError extends Error {}

export const baseUrl = (c: Pick<Conn, 'host' | 'port'>) => `http://${c.host}:${c.port}`;
export const authHeader = (c: Conn) => ({ Authorization: `Bearer ${c.bearer}` });

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T = unknown>(c: Conn, path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const res = await fetchWithTimeout(
    baseUrl(c) + path,
    {
      ...init,
      headers: { ...authHeader(c), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers as object) },
    },
    timeoutMs,
  );
  if (res.status === 401 || res.status === 403) throw new AuthError('Session expired - scan the QR code again');
  if (!res.ok) {
    const detail = await res.json().then((j) => j.detail).catch(() => null);
    throw new Error(detail || `Server error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
