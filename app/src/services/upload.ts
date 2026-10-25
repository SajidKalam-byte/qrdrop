import * as FileSystem from 'expo-file-system/legacy';

import type { Conn } from '../types';
import { api, authHeader, baseUrl } from './api';

export interface Outgoing {
  uri: string;
  name: string;
  size?: number | null;
  mime?: string | null;
}

/** POST registers the item, then the file is streamed from disk by the native uploader (no JS buffering). */
export async function uploadFile(conn: Conn, f: Outgoing): Promise<void> {
  const { upload_id } = await api<{ upload_id: string }>(conn, '/api/uploads', {
    method: 'POST',
    body: JSON.stringify({ name: f.name, size: f.size ?? null, mime: f.mime ?? null }),
  });
  const res = await FileSystem.uploadAsync(`${baseUrl(conn)}/api/uploads/${upload_id}`, f.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { ...authHeader(conn), 'Content-Type': f.mime || 'application/octet-stream' },
  });
  if (res.status >= 300) throw new Error(`${f.name}: server said ${res.status}`);
}

export async function sendText(conn: Conn, body: string): Promise<void> {
  await api(conn, '/api/text', { method: 'POST', body: JSON.stringify({ body }) });
}
