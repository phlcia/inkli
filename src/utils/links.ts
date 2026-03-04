import { Platform } from 'react-native';

const WEB_BASE_URL = 'https://inkliapp.com';
const APP_SCHEME = 'com.inkli.app';

export function getProfileUrl(username: string): string {
  const safeUsername = username.trim();
  return `${WEB_BASE_URL}/u/${encodeURIComponent(safeUsername)}`;
}

export function getProfileDeepLink(username: string): string {
  const safeUsername = username.trim();
  const path = `profile/${encodeURIComponent(safeUsername)}`;

  if (Platform.OS === 'web') {
    return `${WEB_BASE_URL}/${path}`;
  }

  return `${APP_SCHEME}://${path}`;
}

