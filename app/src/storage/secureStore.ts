import * as SecureStore from 'expo-secure-store';

import type { Conn } from '../types';

const KEY = 'qrdrop.conn';

export async function saveConn(c: Conn): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(c));
  } catch {}
}

export async function loadConn(): Promise<Conn | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Conn;
    return c.expiresAt * 1000 > Date.now() ? c : null;
  } catch {
    return null;
  }
}

const ADDR_KEY = 'qrdrop.address';

/** Last server address ("192.168.1.2:8765") so "Enter code" only needs the code next time. */
export async function saveAddress(addr: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(ADDR_KEY, addr);
  } catch {}
}

export async function loadAddress(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ADDR_KEY);
  } catch {
    return null;
  }
}

export async function clearConn(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {}
}
