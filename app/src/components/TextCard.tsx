import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { api } from '../services/api';
import { useSession } from '../state/session';
import type { Item } from '../types';
import { c } from '../theme';

export function TextCard({ item }: { item: Item }) {
  const { conn, setError } = useSession();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(item.body ?? '');
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const del = () => conn && api(conn, `/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }).catch((e) => setError(e.message));

  return (
    <View style={s.card}>
      <Text style={s.meta}>Text · {item.source === 'phone' ? 'from this phone' : 'from computer'}</Text>
      <Text style={s.body} numberOfLines={8} selectable>
        {item.body}
      </Text>
      <View style={s.row}>
        <Pressable style={s.btn} onPress={copy}>
          <Text style={s.btnText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <Pressable onPress={del} hitSlop={8}>
          <Text style={s.del}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  card: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 14, marginHorizontal: 12, marginBottom: 10 },
});

const s = StyleSheet.create({
  card: cardStyles.card,
  meta: { color: c.muted, fontSize: 12, marginBottom: 6 },
  body: { color: c.text, fontFamily: 'monospace', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  btn: { backgroundColor: c.accent, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 9 },
  btnText: { color: '#fff', fontWeight: '600' },
  del: { color: c.danger },
});
