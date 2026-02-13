import { useEffect, useState } from 'react';

/**
 * Tracks network connectivity via navigator.onLine.
 * On React Native, navigator.onLine exists but may not reflect actual connectivity
 * on all devices. For production robustness, consider @react-native-community/netinfo.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === 'undefined' || navigator === null) return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const w = typeof window !== 'undefined' ? window : null;
    if (!w?.addEventListener) return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    w.addEventListener('online', handleOnline);
    w.addEventListener('offline', handleOffline);

    return () => {
      w.removeEventListener('online', handleOnline);
      w.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
