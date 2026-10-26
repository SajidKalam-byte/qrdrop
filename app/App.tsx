import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';
import { SessionProvider } from './src/state/session';

/** OTA: on launch, pull a newer JS bundle from EAS Update and restart into it (nothing is in flight yet). */
async function applyOtaUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {} // offline / no update server: just keep running the bundled version
}

export default function App() {
  useEffect(() => {
    applyOtaUpdate();
  }, []);

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <HomeScreen />
        <StatusBar style="light" />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
