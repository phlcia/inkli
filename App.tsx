import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
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
import { ActivityIndicator, View, StyleSheet, Linking } from 'react-native';
import { colors } from './src/config/theme';
import TabNavigator from './src/navigation/TabNavigator';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import AuthStackNavigator from './src/navigation/AuthStackNavigator';
import { supabase } from './src/config/supabase';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

function AppContent() {
  const { user, loading } = useAuth();
  const isLoading = Boolean(loading);
  const hasUser = Boolean(user);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFlags, setProfileFlags] = useState<{
    completed_onboarding_quiz: boolean;
    skipped_onboarding_quiz: boolean;
  } | null>(null);
  const [profileRefreshCount, setProfileRefreshCount] = useState(0);

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
          .select('completed_onboarding_quiz, skipped_onboarding_quiz')
          .eq('user_id', user.id)
          .single();

        if (error || !data) {
          console.error('Error loading onboarding flags:', error);
          setProfileFlags({
            completed_onboarding_quiz: false,
            skipped_onboarding_quiz: false,
          });
          return;
        }

        setProfileFlags({
          completed_onboarding_quiz: Boolean(data.completed_onboarding_quiz),
          skipped_onboarding_quiz: Boolean(data.skipped_onboarding_quiz),
        });
      } catch (error) {
        console.error('Exception loading onboarding flags:', error);
        setProfileFlags({
          completed_onboarding_quiz: false,
          skipped_onboarding_quiz: false,
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
      if (!user?.created_at) return false;
      const createdAt = new Date(user.created_at).getTime();
      const now = Date.now();
      const createdRecently = now - createdAt < 10 * 60 * 1000;
      return createdRecently;
    })() &&
    !profileFlags.completed_onboarding_quiz &&
    !profileFlags.skipped_onboarding_quiz;

  if (isLoading || (hasUser && (profileLoading || profileFlags === null))) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <NavigationContainer key="main-navigator">
      {hasUser ? (
        needsOnboardingQuiz ? (
          <AuthStackNavigator
            initialRouteName="Quiz"
            onQuizComplete={() => setProfileRefreshCount((count) => count + 1)}
          />
        ) : (
          <TabNavigator />
        )
      ) : (
        <AuthStackNavigator />
      )}
    </NavigationContainer>
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

  useEffect(() => {
    // Handle OAuth redirects
    const handleDeepLink = async (event: { url: string }) => {
      if (event.url) {
        try {
          // Extract code from URL
          const url = new URL(event.url);
          let code = url.searchParams.get('code');
          
          // If not in query params, check hash fragment
          if (!code && url.hash) {
            const hashParams = new URLSearchParams(url.hash.substring(1));
            code = hashParams.get('code');
          }

          // If still not found, try to extract from the full URL string as fallback
          if (!code) {
            const codeMatch = event.url.match(/[#&]code=([^&]+)/);
            code = codeMatch?.[1] ?? null;
          }

          if (code) {
            // Exchange code for session
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              console.error('Error exchanging code for session:', error);
            }
            // Session will be handled by AuthContext's onAuthStateChange
          } else {
            console.log('No code found in deep link URL:', event.url);
          }
        } catch (error) {
          console.error('Error handling deep link:', error);
        }
      }
    };

    // Listen for deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.creamBackground,
  },
});
