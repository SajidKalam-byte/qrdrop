import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { ItemFeed } from '../components/ItemFeed';
import { ScannerHeader } from '../components/ScannerHeader';
import { SendBar } from '../components/SendBar';
import { useSession } from '../state/session';
import { c } from '../theme';

export function HomeScreen() {
  const { busy, conn, error, clearError } = useSession();

  // phone must not sleep mid-transfer
  useEffect(() => {
    if (busy > 0) activateKeepAwakeAsync('qrdrop-transfer').catch(() => {});
    else deactivateKeepAwake('qrdrop-transfer').catch(() => {});
  }, [busy]);

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScannerHeader />
        {conn && error ? (
          <Text style={s.error} onPress={clearError}>
            {error}
          </Text>
        ) : null}
        <SendBar />
        <View style={{ flex: 1 }}>
          <ItemFeed />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  error: { backgroundColor: c.danger, color: '#fff', marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 10, overflow: 'hidden' },
});
