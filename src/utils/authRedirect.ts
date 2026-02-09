import { makeRedirectUri } from 'expo-auth-session';

const USE_AUTH_PROXY =
  process.env.EXPO_PUBLIC_USE_AUTH_PROXY === 'true' && __DEV__;

export function getAuthRedirectUri() {
  if (USE_AUTH_PROXY) {
    return makeRedirectUri({ useProxy: true });
  }

  return makeRedirectUri({
    scheme: 'com.inkli.app',
    path: 'auth/callback',
  });
}
