import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../../../config/theme';
import { supabase } from '../../../config/supabase';
import { ERROR_RED } from '../../../utils/validation';
import iconImage from '../../../../assets/icon.png';

interface ForgotPasswordScreenProps {
  onBack?: () => void;
}

const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleSubmit = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('Please enter your email or username');
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError('');
    setLoading(true);

    try {
      let email = trimmed;

      if (!trimmed.includes('@')) {
        const { data, error: resolveError } = await supabase.functions.invoke('resolve-username', {
          body: { username: trimmed },
        });
        if (resolveError) throw resolveError;
        email = data?.email ?? '';
        if (!email) {
          setSent(true);
          setCooldownRemaining(COOLDOWN_SECONDS);
          return;
        }
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'com.inkli.app://reset-password',
      });

      if (resetError) throw resetError;

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
      setCooldownRemaining(COOLDOWN_SECONDS);
    } catch (err: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
        extraScrollHeight={20}
      >
        <View style={styles.logoContainer}>
          <Image source={iconImage} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text style={styles.title}>forgot password</Text>

        {sent ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              If an account exists for that email or username, we've sent a reset link. Check your
              inbox (and spam) and allow a minute for it to arrive.
            </Text>
            {error ? <Text style={styles.successErrorText}>{error}</Text> : null}
            {cooldownRemaining > 0 ? (
              <Text style={styles.cooldownText}>Resend link in {cooldownRemaining}s</Text>
            ) : (
              <TouchableOpacity
                style={[styles.resendButton, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.resendButtonText}>
                  {loading ? 'Sending...' : 'Resend link'}
                </Text>
              </TouchableOpacity>
            )}
            {onBack && (
              <TouchableOpacity
                style={styles.backToSignInButton}
                onPress={onBack}
                activeOpacity={0.7}
              >
                <Text style={styles.backToSignInButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Enter your email or username and we'll send you a reset link.
            </Text>

            <View>
              <TextInput
                style={[styles.input, error ? styles.inputError : null]}
                placeholder="Email or username"
                placeholderTextColor={colors.brownText}
                value={identifier}
                onChangeText={(v) => {
                  setIdentifier(v);
                  if (error) setError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onSubmitEditing={handleSubmit}
                returnKeyType="send"
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Text>
            </TouchableOpacity>

            {onBack && (
              <TouchableOpacity onPress={onBack} style={styles.backContainer}>
                <Text style={styles.backText}>Back to Sign In</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    width: 150,
    height: 150,
    borderRadius: 16,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 30,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    textAlign: 'center',
    opacity: 0.8,
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.white,
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  inputError: {
    borderColor: ERROR_RED,
  },
  errorText: {
    color: ERROR_RED,
    fontSize: 12,
    fontFamily: typography.body,
    marginTop: -12,
    marginBottom: 12,
    marginLeft: 4,
  },
  button: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
  backContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  backText: {
    color: colors.brownText,
    fontFamily: typography.body,
    fontSize: 14,
  },
  successContainer: {
    alignItems: 'center',
    gap: 24,
  },
  backToSignInButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primaryBlue,
    backgroundColor: colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  backToSignInButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
  successText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    textAlign: 'center',
    lineHeight: 24,
  },
  successErrorText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: ERROR_RED,
    textAlign: 'center',
  },
  cooldownText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    opacity: 0.8,
  },
  resendButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primaryBlue,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  resendButtonText: {
    color: colors.primaryBlue,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
});
