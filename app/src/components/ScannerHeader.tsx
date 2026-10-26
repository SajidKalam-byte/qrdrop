import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Updates from 'expo-updates';

import { LiveScanner } from './LiveScanner';
import { useSession } from '../state/session';
import { loadAddress } from '../storage/secureStore';
import { c } from '../theme';

/** Camera until paired (live preview + Google's scanner button + typed code); a status pill once connected. */
export function ScannerHeader() {
  const { conn, status, error, connectFromQr, disconnect, clearError, setError } = useSession();
  const [perm, requestPerm] = useCameraPermissions();
  const [step, setStep] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const locked = useRef(false);
  const [log, setLog] = useState<string[]>([]);
  const lastNote = useRef({ text: '', at: 0 });

  /** Tiny on-screen trace under the camera so a screenshot shows exactly where scanning stops. */
  const note = (text: string) => {
    const now = Date.now();
    if (text === lastNote.current.text && now - lastNote.current.at < 3000) return;
    lastNote.current = { text, at: now };
    setLog((l) => [...l.slice(-4), text]);
  };

  const connect = async (data: string) => {
    if (locked.current) return;
    locked.current = true;
    clearError();
    note(`pairing with: ${data.slice(0, 70)}`);
    try {
      await connectFromQr(data, setStep);
      note('paired OK');
    } catch (e) {
      note(`failed: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
      setTimeout(() => (locked.current = false), 2500); // allow a retry shortly
    } finally {
      setStep(null);
    }
  };
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const noteRef = useRef(note);
  noteRef.current = note;
  // identity-stable callbacks for the memoised camera (so our own re-renders never re-bind it)
  const detect = useCallback((data: string) => connectRef.current(data), []);
  const report = useCallback((msg: string) => noteRef.current(msg), []);

  useEffect(() => {
    loadAddress().then((a) => a && setAddress((prev) => prev || a));
  }, []);

  // Result of the system/Google scanner (Android: Google code scanner, iOS: DataScanner)
  useEffect(() => {
    const sub = CameraView.onModernBarcodeScanned(({ data }) => connectRef.current(data));
    return () => sub.remove();
  }, []);

  const launchGoogleScanner = async () => {
    clearError();
    try {
      await CameraView.launchScanner({ barcodeTypes: ['qr'] });
    } catch (e) {
      setError(`Scanner unavailable: ${e instanceof Error ? e.message : String(e)}. Use "Enter code" instead.`);
    }
  };

  const submitManual = () => {
    const a = address.trim();
    const k = code.trim().replace(/\s+/g, '');
    // a full pair link in the first box wins; otherwise build one from address + code
    connect(a.includes('/s/') ? a : `http://${a.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}/s/${k}`);
  };

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

  const message = error ?? step ?? 'Click the QR on your computer to enlarge it, hold the phone ~25 cm away, keep steady';

  if (manual) {
    return (
      <View style={[s.box, s.center]}>
        <Text style={s.hint}>Type what the computer's page shows under the QR code</Text>
        <TextInput
          style={s.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Address, e.g. 192.168.1.2:8765"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextInput
          style={s.input}
          value={code}
          onChangeText={setCode}
          placeholder="6-digit code"
          placeholderTextColor={c.muted}
          keyboardType="number-pad"
          maxLength={7}
        />
        <View style={s.row}>
          <Pressable style={s.btn} onPress={submitManual}>
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

  const cameraReady = perm?.granted;

  return (
    <>
    <View style={s.box}>
      {cameraReady ? (
        <LiveScanner onDetect={detect} onEvent={report} />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <Text style={s.hint}>Camera access lets you scan the QR code on your computer.</Text>
          <Pressable style={s.btn} onPress={requestPerm}>
            <Text style={s.btnText}>Allow camera</Text>
          </Pressable>
        </View>
      )}
      {cameraReady && <View style={s.frame} pointerEvents="none" />}
      <View style={s.topBtns}>
        {/* Google's scanner needs Play Services, which many Android phones lack, so it is iOS-only here */}
        {Platform.OS === 'ios' ? (
          <Pressable style={s.chip} onPress={launchGoogleScanner} hitSlop={6}>
            <Text style={s.chipText}>Scan QR</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable style={s.chip} onPress={() => setManual(true)} hitSlop={6}>
          <Text style={s.chipText}>Enter code</Text>
        </Pressable>
      </View>
      <Text style={[s.overlay, error ? s.overlayErr : null]} onPress={clearError}>
        {message}
      </Text>
    </View>
    <Text style={s.log}>
      {`app: ${Updates.isEmbeddedLaunch ? 'built-in' : `update ${(Updates.updateId ?? '').slice(0, 8)}`}\n${log.join('\n')}`}
    </Text>
    </>
  );
}

const s = StyleSheet.create({
  box: { height: '38%', minHeight: 240, backgroundColor: '#000', borderRadius: 18, overflow: 'hidden', margin: 12 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: c.panel },
  hint: { color: c.muted, textAlign: 'center', marginBottom: 10 },
  input: { alignSelf: 'stretch', backgroundColor: c.bg, borderColor: c.line, borderWidth: 1, borderRadius: 10, color: c.text, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 4 },
  msg: { color: c.danger, marginTop: 10, textAlign: 'center', fontSize: 12 },
  btn: { backgroundColor: c.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
  frame: { position: 'absolute', top: '16%', left: '24%', right: '24%', bottom: '36%', borderWidth: 2, borderColor: c.accent, borderRadius: 14 },
  topBtns: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' },
  chip: { backgroundColor: c.accent, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  overlay: { position: 'absolute', bottom: 8, left: 10, right: 10, textAlign: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,.6)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, overflow: 'hidden', fontSize: 12 },
  overlayErr: { backgroundColor: 'rgba(200,40,40,.9)' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.panel, borderRadius: 99, borderWidth: 1, borderColor: c.line },
  dot: { width: 9, height: 9, borderRadius: 5 },
  pillText: { color: c.text, flex: 1 },
  link: { color: c.accent },
  log: { color: c.muted, fontFamily: 'monospace', fontSize: 11, marginHorizontal: 16, marginBottom: 6 },
});
