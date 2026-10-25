import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';
import { SessionProvider } from './src/state/session';

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <HomeScreen />
        <StatusBar style="light" />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
