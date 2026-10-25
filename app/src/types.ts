export interface Conn {
  host: string;
  port: number;
  bearer: string;
  sessionId: string;
  expiresAt: number;
}

export interface Item {
  id: string;
  type: 'file' | 'text' | 'folder';
  name: string;
  size: number;
  received?: number;
  count?: number;
  body?: string;
  mime?: string | null;
  status: 'uploading' | 'complete';
  source: 'desktop' | 'phone';
  created_at: number;
}

export type Status = 'idle' | 'connecting' | 'connected' | 'lost';

export type ServerEvent =
  | { type: 'snapshot'; items: Item[]; session_id: string }
  | { type: 'item_added' | 'item_updated' | 'text_added'; item: Item }
  | { type: 'item_removed'; id: string }
  | { type: 'qr_rotated' }
  | { type: 'wiped' };
