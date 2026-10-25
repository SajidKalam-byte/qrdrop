import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../services/api';
import { saveItem } from '../services/download';
import { useSession } from '../state/session';
import type { Item } from '../types';
import { c, fmtSize } from '../theme';
import { cardStyles } from './TextCard';

export function FileCard({ item }: { item: Item }) {
  const { conn, track, setError } = useSession();
  const [dl, setDl] = useState<number | null>(null);

  const uploading = item.status === 'uploading';
  const frac = uploading && item.size ? Math.min(1, (item.received ?? 0) / item.size) : dl;
  const title = item.type === 'folder' ? `${item.name}/` : item.name;
  const sub =
    item.type === 'folder'
      ? `${item.count} files · ${fmtSize(item.size)} · saved as .zip`
      : `${fmtSize(item.size)} · ${item.source === 'phone' ? 'from this phone' : 'from computer'}`;

  const save = async () => {
    if (!conn) return;
    setDl(0);
    try {
      await track(saveItem(conn, item, setDl));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDl(null);
    }
  };
  const del = () => conn && api(conn, `/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }).catch((e) => setError(e.message));

  return (
    <View style={cardStyles.card}>
      <Text style={s.name} numberOfLines={1}>
        {item.type === 'folder' ? '📁 ' : '📄 '}
        {title}
      </Text>
      <Text style={s.sub}>{uploading ? `Receiving ${fmtSize(item.received ?? 0)} of ${item.size ? fmtSize(item.size) : '?'}` : sub}</Text>
      {frac !== null && frac !== undefined && (
        <View style={s.bar}>
          <View style={[s.fill, { width: `${Math.round(frac * 100)}%` }]} />
        </View>
      )}
      <View style={s.row}>
        {uploading ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <Pressable style={s.btn} onPress={save} disabled={dl !== null}>
            <Text style={s.btnText}>{dl !== null ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        )}
        <Pressable onPress={del} hitSlop={8}>
          <Text style={s.del}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  name: { color: c.text, fontWeight: '600', fontSize: 15 },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  bar: { height: 5, backgroundColor: c.line, borderRadius: 9, overflow: 'hidden', marginTop: 10 },
  fill: { height: '100%', backgroundColor: c.accent },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, minHeight: 34 },
  btn: { backgroundColor: c.accent, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 9 },
  btnText: { color: '#fff', fontWeight: '600' },
  del: { color: c.danger },
});
