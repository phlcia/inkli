import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../config/theme';

interface CreateAccountScreenProps {
  onAppleSignIn: () => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignUp: () => void;
  onBack?: () => void;
}

export default function CreateAccountScreen({
  onAppleSignIn,
  onGoogleSignIn,
  onEmailSignUp,
}: CreateAccountScreenProps) {
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>create an account</Text>

        {/* Apple Sign In */}
        <TouchableOpacity
          style={[styles.appleButton, oauthLoading === 'apple' && styles.buttonDisabled]}
          onPress={async () => {
            try {
              setOauthLoading('apple');
              await onAppleSignIn();
            } catch (error: any) {
              if (error.message && !error.message.includes('cancel')) {
                Alert.alert('Error', error.message || 'Apple Sign In failed');
              }
            } finally {
              setOauthLoading(null);
            }
          }}
          disabled={oauthLoading !== null}
        >
          <Text style={styles.appleIcon}>🍎</Text>
          <Text style={styles.appleButtonText}>
            {oauthLoading === 'apple' ? 'Signing in...' : 'Continue with Apple'}
          </Text>
        </TouchableOpacity>

        {/* Google Sign In */}
        <TouchableOpacity
          style={[styles.googleButton, oauthLoading === 'google' && styles.buttonDisabled]}
          onPress={async () => {
            try {
              setOauthLoading('google');
              await onGoogleSignIn();
            } catch (error: any) {
              if (error.message && !error.message.includes('cancel')) {
                Alert.alert('Error', error.message || 'Google Sign In failed');
              }
            } finally {
              setOauthLoading(null);
            }
          }}
          disabled={oauthLoading !== null}
        >
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleButtonText}>
            {oauthLoading === 'google' ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        {/* Separator */}
        <View style={styles.separator}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>or</Text>
          <View style={styles.separatorLine} />
        </View>

        {/* Email Sign Up */}
        <TouchableOpacity style={styles.emailButton} onPress={onEmailSignUp}>
          <Text style={styles.emailIcon}>✉</Text>
          <Text style={styles.emailButtonText}>Sign up with Email</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 40,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  appleButton: {
    backgroundColor: colors.brownText,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appleIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  appleButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '500',
  },
  googleButton: {
    backgroundColor: colors.white,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4285F4',
    marginRight: 12,
    width: 24,
    height: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  googleButtonText: {
    color: colors.brownText,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '500',
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginHorizontal: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.brownText,
    opacity: 0.2,
  },
  separatorText: {
    marginHorizontal: 12,
    color: colors.brownText,
    fontFamily: typography.body,
    fontSize: 14,
    opacity: 0.6,
  },
  emailButton: {
    backgroundColor: colors.white,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  emailIcon: {
    fontSize: 20,
    marginRight: 12,
    color: colors.brownText,
  },
  emailButtonText: {
    color: colors.brownText,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '500',
  },
});
