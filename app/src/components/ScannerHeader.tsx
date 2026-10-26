import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useSession } from '../state/session';
import { c } from '../theme';

/** Live camera until paired; collapses to a status pill once connected. */
export function ScannerHeader() {
  const { conn, status, error, connectFromQr, disconnect, clearError } = useSession();
  const [perm, requestPerm] = useCameraPermissions();
  const [step, setStep] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');
  const locked = useRef(false);

  if (conn) {
    const live = status === 'connected';
    return (
      <View style={s.pillRow}>
        <View style={[s.dot, { backgroundColor: live ? c.ok : c.muted }]} />
        <Text style={s.pillText}>
          {live ? 'Connected' : status === 'lost' ? 'Reconnecting' : 'Connecting'} · {conn.host}
        </Text>
        <Pressable onPress={disconnect} hitSlop={10}>
          <Text style={s.link}>Disconnect</Text>
        </Pressable>
      </View>
    );
  }

  const connect = async (data: string) => {
    if (locked.current) return;
    locked.current = true;
    clearError();
    try {
      await connectFromQr(data, setStep);
      setStep(null);
    } catch {
      setStep(null);
      setTimeout(() => (locked.current = false), 2500); // let the user read the error, then allow a retry
    }
  };

  const message = error ?? step ?? 'Run qrdrop on your computer and scan the QR code';

  if (manual) {
    return (
      <View style={[s.box, s.center]}>
        <Text style={s.hint}>Paste the link shown under the QR code on your computer</Text>
        <TextInput
          style={s.input}
          value={typed}
          onChangeText={setTyped}
          placeholder="http://192.168.1.2:8765/s/…"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={s.row}>
          <Pressable style={s.btn} onPress={() => connect(typed)}>
            <Text style={s.btnText}>Connect</Text>
          </Pressable>
          <Pressable onPress={() => setManual(false)} hitSlop={10}>
            <Text style={s.link}>Back to camera</Text>
          </Pressable>
        </View>
        {(error || step) && <Text style={s.msg}>{error ?? step}</Text>}
      </View>
    );
  }

  if (!perm) return <View style={s.box} />;
  if (!perm.granted) {
    return (
      <View style={[s.box, s.center]}>
        <Text style={s.hint}>Camera access is needed to scan the QR code on your computer.</Text>
        <Pressable style={s.btn} onPress={requestPerm}>
          <Text style={s.btnText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => setManual(true)} hitSlop={10} style={{ marginTop: 14 }}>
          <Text style={s.link}>Enter link manually</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.box}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => connect(data)}
      />
      <View style={s.frame} pointerEvents="none" />
      <Pressable style={s.manual} onPress={() => setManual(true)} hitSlop={8}>
        <Text style={s.manualText}>Enter link</Text>
      </Pressable>
      <Text style={[s.overlay, error ? s.overlayErr : null]} onPress={clearError}>
        {message}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { height: '35%', minHeight: 230, backgroundColor: '#000', borderRadius: 18, overflow: 'hidden', margin: 12 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: c.panel },
  hint: { color: c.muted, textAlign: 'center', marginBottom: 10 },
  input: { alignSelf: 'stretch', backgroundColor: c.bg, borderColor: c.line, borderWidth: 1, borderRadius: 10, color: c.text, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  msg: { color: c.danger, marginTop: 10, textAlign: 'center', fontSize: 12 },
  btn: { backgroundColor: c.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
  frame: { position: 'absolute', top: '14%', left: '25%', right: '25%', bottom: '38%', borderWidth: 2, borderColor: c.accent, borderRadius: 14 },
  manual: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  manualText: { color: '#fff', fontSize: 12 },
  overlay: { position: 'absolute', bottom: 8, left: 10, right: 10, textAlign: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,.6)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, overflow: 'hidden', fontSize: 12 },
  overlayErr: { backgroundColor: 'rgba(200,40,40,.9)' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.panel, borderRadius: 99, borderWidth: 1, borderColor: c.line },
  dot: { width: 9, height: 9, borderRadius: 5 },
  pillText: { color: c.text, flex: 1 },
  link: { color: c.accent },
});
