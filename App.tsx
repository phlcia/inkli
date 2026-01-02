import React, { useEffect } from 'react';
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <NavigationContainer key="main-navigator">
      {hasUser ? <TabNavigator /> : <AuthStackNavigator />}
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
            code = codeMatch ? codeMatch[1] : null;
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
