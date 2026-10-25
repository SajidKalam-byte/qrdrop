import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useSession } from '../state/session';
import { c } from '../theme';

/** Live camera until paired; collapses to a status pill once connected. */
export function ScannerHeader() {
  const { conn, status, error, connectFromQr, disconnect, clearError } = useSession();
  const [perm, requestPerm] = useCameraPermissions();
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

  const onScan = async ({ data }: { data: string }) => {
    if (locked.current) return;
    locked.current = true;
    try {
      await connectFromQr(data);
    } catch {
      setTimeout(() => (locked.current = false), 1500); // let the user read the error, then allow a retry
    }
  };

  if (!perm) return <View style={s.box} />;
  if (!perm.granted) {
    return (
      <View style={[s.box, s.center]}>
        <Text style={s.hint}>Camera access is needed to scan the QR code on your computer.</Text>
        <Pressable style={s.btn} onPress={requestPerm}>
          <Text style={s.btnText}>Allow camera</Text>
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
        onBarcodeScanned={onScan}
      />
      <View style={s.frame} pointerEvents="none" />
      <Text style={s.overlay} onPress={clearError}>
        {error ?? 'Run qrdrop on your computer and scan the QR code'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { height: '35%', minHeight: 220, backgroundColor: '#000', borderRadius: 18, overflow: 'hidden', margin: 12 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: c.panel },
  hint: { color: c.muted, textAlign: 'center', marginBottom: 12 },
  btn: { backgroundColor: c.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
  frame: { position: 'absolute', top: '18%', left: '25%', right: '25%', bottom: '28%', borderWidth: 2, borderColor: c.accent, borderRadius: 14 },
  overlay: { position: 'absolute', bottom: 10, left: 12, right: 12, textAlign: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,.55)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, overflow: 'hidden' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.panel, borderRadius: 99, borderWidth: 1, borderColor: c.line },
  dot: { width: 9, height: 9, borderRadius: 5 },
  pillText: { color: c.text, flex: 1 },
  link: { color: c.accent },
});
