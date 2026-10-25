import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

import { sendText, uploadFile, type Outgoing } from '../services/upload';
import { useSession } from '../state/session';
import { c } from '../theme';

/** Everything the user can send, always visible: text box + Files / Photos / Paste buttons. */
export function SendBar() {
  const { conn, status, track, setError } = useSession();
  const [text, setText] = useState('');
  if (!conn) return null;
  const disabled = status !== 'connected';

  const run = async (job: Promise<unknown>) => {
    try {
      await track(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const sendAll = (files: Outgoing[]) => Promise.all(files.map((f) => uploadFile(conn, f)));

  const submit = async () => {
    const body = text;
    if (!body.trim()) return;
    setText('');
    Haptics.selectionAsync().catch(() => {});
    run(sendText(conn, body));
  };

  const pickFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    run(sendAll(r.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size, mime: a.mimeType }))));
  };

  const pickMedia = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1, // no recompression
    });
    if (r.canceled) return;
    run(sendAll(r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `media-${Date.now()}-${i}`, size: a.fileSize, mime: a.mimeType }))));
  };

  const pasteClipboard = async () => {
    const clip = await Clipboard.getStringAsync();
    if (!clip.trim()) return setError('Clipboard is empty');
    run(sendText(conn, clip));
  };

  return (
    <View style={s.wrap}>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Type text to send to your computer"
          placeholderTextColor={c.muted}
          multiline
          editable={!disabled}
        />
        <Pressable style={[s.send, (disabled || !text.trim()) && s.off]} onPress={submit} disabled={disabled || !text.trim()}>
          <Text style={s.sendText}>Send</Text>
        </Pressable>
      </View>
      <View style={s.btnRow}>
        <Action label="📄  Files" onPress={pickFiles} disabled={disabled} />
        <Action label="🖼  Photos" onPress={pickMedia} disabled={disabled} />
        <Action label="📋  Paste" onPress={pasteClipboard} disabled={disabled} />
      </View>
    </View>
  );
}

const Action = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) => (
  <Pressable style={[s.action, disabled && s.off]} onPress={onPress} disabled={disabled}>
    <Text style={s.actionText}>{label}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginBottom: 10, gap: 8 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 46, maxHeight: 120, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 12, color: c.text, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  send: { backgroundColor: c.accent, height: 46, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionText: { color: c.text, fontWeight: '600' },
  off: { opacity: 0.45 },
});
