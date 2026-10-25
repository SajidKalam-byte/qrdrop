import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { Conn, Item } from '../types';
import { authHeader, baseUrl } from './api';

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_');

/** Downloads to the cache dir, then opens the share sheet so the user picks "Save to Files" / an app. */
export async function saveItem(conn: Conn, item: Item, onProgress: (frac: number) => void): Promise<void> {
  const name = item.type === 'folder' ? `${safe(item.name)}.zip` : safe(item.name);
  const dest = `${FileSystem.cacheDirectory}${Date.now()}-${name}`;
  const task = FileSystem.createDownloadResumable(
    `${baseUrl(conn)}/api/items/${encodeURIComponent(item.id)}/download`,
    dest,
    { headers: authHeader(conn) },
    (p) => {
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : item.size;
      if (total > 0) onProgress(Math.min(1, p.totalBytesWritten / total));
    },
  );
  const res = await task.downloadAsync();
  if (!res || res.status >= 300) throw new Error(`Download failed (${res?.status ?? 'no response'})`);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
}
