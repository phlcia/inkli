import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../../contexts/AuthContext';
import { colors, typography } from '../../../config/theme';
import { supabase } from '../../../config/supabase';
import { getAuthRedirectUri } from '../../../utils/authRedirect';

// This is important for the OAuth flow to work properly
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      if (isSignUp) {
        await signUp(email, password);
        Alert.alert('Success', 'Account created! Please check your email to verify.');
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const redirectUri = getAuthRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: false,
        }
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUri
        );

        if (result.type === 'success') {
          // The session will be handled by your AuthContext
          // through the deep link listener
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      enableOnAndroid={true}
      extraScrollHeight={20}
    >
        <Text style={styles.logo}>inkli</Text>
        <Text style={styles.title}>{isSignUp ? 'Sign Up' : 'Sign In'}</Text>

      <TextInput
        style={styles.input}
        placeholder="Username or email"
        placeholderTextColor={colors.brownText}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.brownText}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
        disabled={Boolean(loading)}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={styles.googleButton}
        onPress={handleGoogleSignIn}
        disabled={Boolean(loading)}
      >
        <Text style={styles.googleButtonText}>
          Continue with Google
        </Text>
      </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.switchText}>
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.creamBackground,
    padding: 24,
    paddingVertical: 48,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 48,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
    textAlign: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.brownText,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    backgroundColor: colors.white,
  },
  button: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.brownText,
    opacity: 0.2,
  },
  dividerText: {
    marginHorizontal: 16,
    color: colors.brownText,
    fontFamily: typography.body,
    fontSize: 14,
    opacity: 0.5,
  },
  googleButton: {
    backgroundColor: colors.white,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  googleButtonText: {
    color: colors.brownText,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    color: colors.brownText,
    fontFamily: typography.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
    opacity: 0.7,
  },
});
