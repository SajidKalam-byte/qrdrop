import { FlatList, StyleSheet, Text } from 'react-native';

import { useSession } from '../state/session';
import { c } from '../theme';
import { FileCard } from './FileCard';
import { TextCard } from './TextCard';

export function ItemFeed() {
  const { items, conn } = useSession();
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => (item.type === 'text' ? <TextCard item={item} /> : <FileCard item={item} />)}
      contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
      ListEmptyComponent={
        <Text style={s.empty}>{conn ? 'Nothing here yet.\nDrop something on your computer, or send something above.' : 'Scan the QR code to start.'}</Text>
      }
    />
  );
}

const s = StyleSheet.create({
  empty: { color: c.muted, textAlign: 'center', marginTop: 40, lineHeight: 22 },
});
