import React, { useState } from 'react';
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
import { ERROR_RED, SUCCESS_GREEN, PASSWORD_REQUIREMENTS } from '../../../utils/validation';
import iconImage from '../../../../assets/icon.png';

interface ResetPasswordScreenProps {
  onComplete?: () => void;
}

export default function ResetPasswordScreen({ onComplete }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordRequirementsMet = PASSWORD_REQUIREMENTS.every((r) => r.check(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isFormValid = passwordRequirementsMet && passwordsMatch;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError('');
    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      await supabase.auth.signOut();
      onComplete?.();
    } catch (err: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || 'Failed to update password. Please try again.');
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

        <Text style={styles.title}>set new password</Text>

        {error ? <Text style={styles.topErrorText}>{error}</Text> : null}

        <View>
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.brownText}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.passwordChecklist}>
            {PASSWORD_REQUIREMENTS.map((req) => {
              const met = req.check(password);
              return (
                <Text
                  key={req.key}
                  style={[styles.checklistItem, met ? styles.checklistMet : styles.checklistUnmet]}
                >
                  {met ? '✓' : '○'} {req.label}
                </Text>
              );
            })}
          </View>
        </View>

        <View>
          <TextInput
            style={[
              styles.input,
              confirmTouched && confirmPassword.length > 0 && !passwordsMatch && styles.inputError,
            ]}
            placeholder="Confirm new password"
            placeholderTextColor={colors.brownText}
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              setConfirmTouched(true);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          {confirmTouched && confirmPassword.length > 0 && (
            passwordsMatch ? (
              <Text style={styles.successText}>✓ Passwords match</Text>
            ) : (
              <Text style={styles.errorText}>✗ Passwords don't match</Text>
            )
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, (!isFormValid || loading) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!isFormValid || loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Updating...' : 'Update Password'}
          </Text>
        </TouchableOpacity>
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
    marginBottom: 20,
  },
  topErrorText: {
    color: ERROR_RED,
    fontSize: 14,
    fontFamily: typography.body,
    textAlign: 'center',
    marginBottom: 16,
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
  successText: {
    color: SUCCESS_GREEN,
    fontSize: 12,
    fontFamily: typography.body,
    marginTop: -12,
    marginBottom: 12,
    marginLeft: 4,
  },
  passwordChecklist: {
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
  },
  checklistItem: {
    fontSize: 12,
    fontFamily: typography.body,
    marginBottom: 4,
  },
  checklistMet: {
    color: SUCCESS_GREEN,
  },
  checklistUnmet: {
    color: colors.brownText,
    opacity: 0.6,
  },
  button: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
});
