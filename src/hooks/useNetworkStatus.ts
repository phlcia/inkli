import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Tracks network connectivity via @react-native-community/netinfo.
 * Uses native APIs on iOS/Android for reliable detection (navigator.onLine
 * is unreliable on React Native, especially in TestFlight builds).
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isConnected can be boolean | null; null means unknown
      const connected = state.isConnected ?? true;
      setIsOnline(connected);
    });

    return () => unsubscribe();
  }, []);

  return { isOnline };
}
