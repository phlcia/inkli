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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, typography } from '../../../config/theme';
import { supabase } from '../../../config/supabase';
import { ERROR_RED } from '../../../utils/validation';
import { AuthStackParamList } from '../../../navigation/AuthStackNavigator';
import iconImage from '../../../../assets/icon.png';

type Props = NativeStackScreenProps<AuthStackParamList, 'EnterCode'> & {
  onBack?: () => void;
};

const COOLDOWN_SECONDS = 60;

export default function EnterCodeScreen({ route, onBack }: Props) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError('');
    setLoading(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: trimmed,
        type: 'recovery',
      });

      if (verifyError) throw verifyError;

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // PASSWORD_RECOVERY event fires → AuthContext sets pendingPasswordRecovery → ResetPasswordScreen shown
    } catch (err: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      if (resetError) throw resetError;

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCooldownRemaining(COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
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

        <Text style={styles.title}>enter code</Text>

        <Text style={styles.subtitle}>
          We sent a 6-digit code to {email}. Enter it below to continue.
        </Text>

        <View>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="6-digit code"
            placeholderTextColor={colors.brownText}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              if (error) setError('');
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            maxLength={6}
            onSubmitEditing={handleVerify}
            returnKeyType="done"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        <TouchableOpacity
          style={[styles.button, (loading || code.trim().length !== 6) && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading || code.trim().length !== 6}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Verifying...' : 'Verify Code'}
          </Text>
        </TouchableOpacity>

        <View style={styles.resendRow}>
          {cooldownRemaining > 0 ? (
            <Text style={styles.cooldownText}>Resend code in {cooldownRemaining}s</Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
              <Text style={styles.resendText}>
                {resending ? 'Sending...' : 'Resend code'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backContainer}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
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
    fontSize: 20,
    color: colors.brownText,
    borderWidth: 1,
    borderColor: colors.brownText,
    textAlign: 'center',
    letterSpacing: 6,
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
  resendRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  cooldownText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    opacity: 0.8,
  },
  resendText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.primaryBlue,
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
});
