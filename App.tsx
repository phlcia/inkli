import React, { useEffect, useRef, useState } from 'react';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_900Black_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { ActivityIndicator, AppState, Text, TouchableOpacity, View, StyleSheet, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from './src/config/theme';
import TabNavigator from './src/navigation/TabNavigator';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ErrorHandlerProvider } from './src/contexts/ErrorHandlerContext';
import { useNetworkStatus } from './src/hooks/useNetworkStatus';
import { OfflineBanner } from './src/components/OfflineBanner';
import AuthStackNavigator from './src/navigation/AuthStackNavigator';
import { supabase } from './src/config/supabase';
import * as Notifications from 'expo-notifications';
import { clearBadge, registerPushToken } from './src/services/notifications';
import {
  storePendingInviteCode,
  clearPendingInviteCode,
} from './src/services/invites';
import { getUserIdByUsername } from './src/services/userProfile';
import { typography } from './src/config/theme';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Configure how notifications are displayed when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function AccountSuspendedScreen({
  moderationStatus,
  onSignOut,
}: {
  moderationStatus: string | null;
  onSignOut: () => void;
}) {
  const title =
    moderationStatus === 'banned'
      ? 'Account banned'
      : 'Account suspended';
  const message =
    moderationStatus === 'banned'
      ? 'Your account has been banned. If you believe this is an error, please contact support.'
      : 'Your account has been suspended. If you believe this is an error, please contact support.';

  return (
    <View style={suspendedStyles.container}>
      <Text style={suspendedStyles.title}>{title}</Text>
      <Text style={suspendedStyles.message}>{message}</Text>
      <TouchableOpacity style={suspendedStyles.button} onPress={onSignOut} activeOpacity={0.7}>
        <Text style={suspendedStyles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const suspendedStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.creamBackground,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: colors.primaryBlue,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
});

const linking = {
  prefixes: ['https://inkliapp.com', 'com.inkli.app://', 'inkli://'],
};

const navigationRef = createNavigationContainerRef<any>();

function AppContent() {
  const { user, loading, pendingPasswordRecovery, setPendingPasswordRecovery, signOut } = useAuth();
  const { isOnline } = useNetworkStatus();
  const isLoading = Boolean(loading);
  const hasUser = Boolean(user);
  const [postResetMessage, setPostResetMessage] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFlags, setProfileFlags] = useState<{
    completed_onboarding_quiz: boolean;
    skipped_onboarding_quiz: boolean;
    member_since: string | null;
    created_at: string | null;
    sent_invites_count: number;
    grandfathered_invite_unlock: boolean;
    moderation_status: string | null;
  } | null>(null);
  const [profileRefreshCount, setProfileRefreshCount] = useState(0);
  const prevUserRef = useRef(user);

  // Clear pending invite code when auth session is destroyed (sign out or expiry).
  useEffect(() => {
    if (prevUserRef.current !== null && user === null) {
      void clearPendingInviteCode();
    }
    prevUserRef.current = user;
  }, [user]);

  // Register push token once the user is authenticated.
  useEffect(() => {
    if (!user) return;
    void registerPushToken(user.id);
  }, [user?.id]);

  // Navigate to Notifications screen when user taps a push notification.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Home', { screen: 'Notifications' });
      }
    });
    return () => subscription.remove();
  }, []);

  // Clear the app icon badge whenever the app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void clearBadge();
      }
    });
    return () => subscription.remove();
  }, []);

  // Deep link handling (invite URLs and OAuth). Runs in AppContent so we can check user for invite.
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      if (!event?.url) return;
      try {
        const inviteMatch = event.url.match(/\/invite\/([a-zA-Z0-9]+)/);
        if (inviteMatch?.[1]) {
          if (!user) {
            await storePendingInviteCode(inviteMatch[1]);
          }
          return;
        }

        const url = new URL(event.url);

        const isResetPasswordLink =
          url.pathname === '/reset-password' || url.pathname === 'reset-password';

        let usernameFromProfileLink: string | null = null;

        if (
          url.hostname === 'inkliapp.com' &&
          url.pathname.startsWith('/u/')
        ) {
          const [, , usernamePart] = url.pathname.split('/');
          if (usernamePart) {
            usernameFromProfileLink = decodeURIComponent(usernamePart);
          }
        } else if (
          (url.protocol === 'com.inkli.app:' || url.protocol === 'inkli:') &&
          url.pathname.startsWith('/profile/')
        ) {
          const [, , usernamePart] = url.pathname.split('/');
          if (usernamePart) {
            usernameFromProfileLink = decodeURIComponent(usernamePart);
          }
        }

        if (usernameFromProfileLink) {
          if (user && navigationRef.isReady()) {
            const userId = await getUserIdByUsername(usernameFromProfileLink);
            if (userId) {
              navigationRef.navigate('Profile', {
                screen: 'UserProfile',
                params: { userId, username: usernameFromProfileLink },
              });
            }
          }
          return;
        }

        // Handle implicit-flow password recovery (access_token + type=recovery in hash)
        if (url.hash) {
          const hashParams = new URLSearchParams(url.hash.substring(1));
          if (hashParams.get('type') === 'recovery') {
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken && refreshToken) {
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (error) console.error('Error setting recovery session:', error);
              else setPendingPasswordRecovery(true);
            }
            return;
          }
        }

        let code = url.searchParams.get('code');
        if (!code && url.hash) {
          const hashParams = new URLSearchParams(url.hash.substring(1));
          code = hashParams.get('code');
        }
        if (!code) {
          const codeMatch = event.url.match(/[#&]code=([^&]+)/);
          code = codeMatch?.[1] ?? null;
        }
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error('Error exchanging code for session:', error);
          else if (isResetPasswordLink) setPendingPasswordRecovery(true);
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    };
    const subscription = Linking.addEventListener('url', handleDeepLink);
    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });
    return () => subscription.remove();
  }, [user, setPendingPasswordRecovery]);

  useEffect(() => {
    const fetchProfileFlags = async () => {
      if (!user) {
        setProfileFlags(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('completed_onboarding_quiz, skipped_onboarding_quiz, member_since, created_at, sent_invites_count, grandfathered_invite_unlock, moderation_status')
          .eq('user_id', user.id)
          .single();

        if (error || !data) {
          console.error('Error loading onboarding flags:', error);
setProfileFlags({
          completed_onboarding_quiz: false,
          skipped_onboarding_quiz: false,
          member_since: null,
          created_at: null,
          sent_invites_count: 0,
          grandfathered_invite_unlock: false,
          moderation_status: null,
        });
        return;
      }

        setProfileFlags({
          completed_onboarding_quiz: Boolean(data.completed_onboarding_quiz),
          skipped_onboarding_quiz: Boolean(data.skipped_onboarding_quiz),
          member_since: data.member_since ?? null,
          created_at: data.created_at ?? null,
          sent_invites_count: Number(data.sent_invites_count) || 0,
          grandfathered_invite_unlock: Boolean(data.grandfathered_invite_unlock),
          moderation_status: data.moderation_status ?? null,
        });
      } catch (error) {
        console.error('Exception loading onboarding flags:', error);
        setProfileFlags({
          completed_onboarding_quiz: false,
          skipped_onboarding_quiz: false,
          member_since: null,
          created_at: null,
          sent_invites_count: 0,
          grandfathered_invite_unlock: false,
          moderation_status: null,
        });
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfileFlags();
  }, [user, profileRefreshCount]);

  const needsOnboardingQuiz =
    hasUser &&
    profileFlags !== null &&
    (() => {
      const createdAt =
        user?.created_at ||
        profileFlags.member_since ||
        profileFlags.created_at;
      if (!createdAt) return false;
      const createdAtMs = new Date(createdAt).getTime();
      const now = Date.now();
      return now - createdAtMs < 10 * 60 * 1000;
    })() &&
    !profileFlags.completed_onboarding_quiz &&
    !profileFlags.skipped_onboarding_quiz;

  const needsInviteGate =
    hasUser &&
    !profileFlags?.grandfathered_invite_unlock &&
    (profileFlags?.sent_invites_count ?? 0) < 4;

  const isSuspendedOrBanned =
    hasUser &&
    profileFlags !== null &&
    (profileFlags.moderation_status === 'suspended' || profileFlags.moderation_status === 'banned');

  if (isLoading || (hasUser && (profileLoading || profileFlags === null))) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <ErrorHandlerProvider>
      <GestureHandlerRootView style={styles.appRoot}>
        <OfflineBanner visible={!isOnline} />
        <NavigationContainer
          key="main-navigator"
          linking={linking}
          ref={navigationRef}
        >
          {pendingPasswordRecovery ? (
          <AuthStackNavigator
            initialRouteName="ResetPassword"
            onPasswordReset={() =>
              setPostResetMessage('Password updated. Sign in with your new password.')
            }
          />
        ) : hasUser ? (
          isSuspendedOrBanned ? (
            <AccountSuspendedScreen
              moderationStatus={profileFlags?.moderation_status ?? null}
              onSignOut={signOut}
            />
          ) : needsInviteGate ? (
            <AuthStackNavigator
              initialRouteName="InviteGate"
              onInviteGateCleared={() => setProfileRefreshCount((count) => count + 1)}
            />
          ) : needsOnboardingQuiz ? (
            <AuthStackNavigator
              initialRouteName="Quiz"
              onQuizComplete={() => setProfileRefreshCount((count) => count + 1)}
            />
          ) : (
            <TabNavigator />
          )
        ) : (
          <AuthStackNavigator
            initialRouteName={postResetMessage ? 'SignIn' : 'Welcome'}
            successMessage={postResetMessage ?? undefined}
          />
        )}
        </NavigationContainer>
      </GestureHandlerRootView>
    </ErrorHandlerProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': PlayfairDisplay_400Regular_Italic,
    'PlayfairDisplay-Black-Italic': PlayfairDisplay_900Black_Italic,
    'Inter-Light': Inter_300Light,
    'Inter': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
  });

  const areFontsLoaded = Boolean(fontsLoaded);

  if (!areFontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.creamBackground,
  },
});
