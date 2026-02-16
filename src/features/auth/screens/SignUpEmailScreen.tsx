import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, typography } from '../../../config/theme';
import { checkUsernameAvailability } from '../../../services/userProfile';
import { normalizePhone } from '../../../utils/phone';
import iconImage from '../../../../assets/icon.png';

// Validation constants
const MAX_USERNAME_LENGTH = 30;
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const DEBOUNCE_MS = 300;
const SUCCESS_GREEN = '#34C759';
const ERROR_RED = '#FF3B30';

// Basic email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password requirements
const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', check: (p: string) => p.length >= 8 },
  { key: 'uppercase', label: 'Contains uppercase letter', check: (p: string) => /[A-Z]/.test(p) },
  { key: 'lowercase', label: 'Contains lowercase letter', check: (p: string) => /[a-z]/.test(p) },
  { key: 'number', label: 'Contains number', check: (p: string) => /[0-9]/.test(p) },
  {
    key: 'special',
    label: 'Contains special character',
    check: (p: string) => /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'`~]/.test(p),
  },
] as const;

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

interface SignUpEmailScreenProps {
  onNext: (email: string, password: string, name: string, username: string, phone: string | null) => void;
  onBack?: () => void;
}

export default function SignUpEmailScreen({ onNext, onBack: _onBack }: SignUpEmailScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');

  // Validation state
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameFormatError, setUsernameFormatError] = useState('');
  const [usernameRequiredError, setUsernameRequiredError] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const usernameRef = useRef(username);
  const prevUsernameStatusRef = useRef<UsernameStatus>('idle');
  const prevPasswordMatchRef = useRef<boolean | null>(null);

  usernameRef.current = username;

  const runUsernameCheck = useCallback(async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > MAX_USERNAME_LENGTH || !USERNAME_REGEX.test(value)) {
      return;
    }

    setUsernameStatus('checking');

    const valueToCheck = trimmed;
    const { available, error } = await checkUsernameAvailability(valueToCheck);

    // Stale response guard: user may have typed something else while we were fetching
    if (valueToCheck !== usernameRef.current.trim().toLowerCase()) {
      return;
    }

    if (error) {
      setUsernameStatus('error');
      return;
    }

    const newStatus: UsernameStatus = available ? 'available' : 'taken';
    setUsernameStatus(newStatus);

    // Haptic on state transition
    if (prevUsernameStatusRef.current !== newStatus) {
      if (Platform.OS === 'ios') {
        void Haptics.notificationAsync(
          available
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error
        );
      }
      prevUsernameStatusRef.current = newStatus;
    }
  }, []);

  const scheduleUsernameCheck = useCallback(
    (value: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      const trimmed = value.trim().toLowerCase();
      if (trimmed.length < 3) {
        setUsernameStatus('idle');
        setUsernameFormatError(trimmed.length > 0 ? 'Username must be at least 3 characters' : '');
        return;
      }
      if (trimmed.length > MAX_USERNAME_LENGTH) {
        setUsernameStatus('idle');
        setUsernameFormatError(`Username must be ${MAX_USERNAME_LENGTH} characters or less`);
        return;
      }
      if (!USERNAME_REGEX.test(value)) {
        setUsernameStatus('idle');
        setUsernameFormatError('Username must start with a letter and contain only letters, numbers, and underscores');
        return;
      }

      setUsernameFormatError('');
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void runUsernameCheck(value);
      }, DEBOUNCE_MS);
    },
    [runUsernameCheck]
  );

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (usernameRequiredError) setUsernameRequiredError('');

    if (value.trim().length < 3) {
      setUsernameStatus('idle');
      setUsernameFormatError(value.length > 0 ? 'Username must be at least 3 characters' : '');
      return;
    }
    if (!USERNAME_REGEX.test(value)) {
      setUsernameStatus('idle');
      setUsernameFormatError(
        value.length > 0
          ? 'Username must start with a letter and contain only letters, numbers, and underscores'
          : ''
      );
      return;
    }

    setUsernameFormatError('');
    scheduleUsernameCheck(value);
  };

  const handleUsernameBlur = () => {
    if (!username.trim()) {
      setUsernameRequiredError('Username is required');
      return;
    }
    setUsernameRequiredError('');
    if (username.trim().length >= 3 && USERNAME_REGEX.test(username)) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void runUsernameCheck(username);
    }
  };

  const handleRetryUsernameCheck = () => {
    if (usernameStatus === 'error' && username.trim().length >= 3 && USERNAME_REGEX.test(username)) {
      void runUsernameCheck(username);
    }
  };

  const validateNameBlur = () => {
    const err = name.trim() ? '' : 'Name is required';
    setNameError(err);
  };

  const validateEmailBlur = () => {
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    setEmailError(EMAIL_REGEX.test(email.trim()) ? '' : 'Please enter a valid email');
  };

  const validatePhoneBlur = () => {
    if (!phone.trim()) {
      setPhoneError('');
      return;
    }
    const normalized = normalizePhone(phone.trim());
    setPhoneError(normalized ? '' : 'Please enter a valid US phone number');
  };

  const validatePasswordBlur = () => {
    setPasswordError(password.trim() ? '' : 'Password is required');
  };

  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const showPasswordMatchFeedback = confirmPasswordTouched && confirmPassword.length > 0;

  useEffect(() => {
    if (!showPasswordMatchFeedback) {
      prevPasswordMatchRef.current = null;
      return;
    }
    const prev = prevPasswordMatchRef.current;
    prevPasswordMatchRef.current = passwordsMatch;
    if (prev !== null && prev !== passwordsMatch && Platform.OS === 'ios') {
      void Haptics.notificationAsync(
        passwordsMatch
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error
      );
    }
  }, [passwordsMatch, showPasswordMatchFeedback]);

  const passwordRequirementsMet = PASSWORD_REQUIREMENTS.every((r) => r.check(password));
  const isFormValid =
    name.trim().length > 0 &&
    !nameError &&
    username.trim().length >= 3 &&
    username.length <= MAX_USERNAME_LENGTH &&
    USERNAME_REGEX.test(username) &&
    usernameStatus === 'available' &&
    EMAIL_REGEX.test(email.trim()) &&
    !emailError &&
    (phone.trim() === '' || !!normalizePhone(phone.trim())) &&
    !phoneError &&
    passwordRequirementsMet &&
    password === confirmPassword &&
    confirmPassword.length > 0;

  const handleNext = async () => {
    validateNameBlur();
    handleUsernameBlur();
    validateEmailBlur();
    validatePasswordBlur();
    validatePhoneBlur();

    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    if (!username.trim()) {
      setUsernameRequiredError('Username is required');
      return;
    }
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!password.trim()) {
      setPasswordError('Password is required');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError('Please enter a valid email');
      return;
    }
    if (phone.trim() && !normalizePhone(phone.trim())) {
      setPhoneError('Please enter a valid US phone number');
      return;
    }
    if (usernameStatus !== 'available') {
      return;
    }
    if (!passwordRequirementsMet || password !== confirmPassword) {
      return;
    }

    let normalizedPhone: string | null = null;
    if (phone.trim()) {
      normalizedPhone = normalizePhone(phone.trim());
      if (!normalizedPhone) {
        setPhoneError('Please enter a valid phone number');
        return;
      }
    }

    onNext(email.trim(), password, name.trim(), username.trim().toLowerCase(), normalizedPhone);
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
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={iconImage} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text style={styles.title}>sign up with email</Text>

        {/* Name Input */}
        <View>
          <TextInput
            style={[styles.input, nameError ? styles.inputError : null]}
            placeholder="Name"
            placeholderTextColor={colors.brownText}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (nameError) setNameError('');
            }}
            onBlur={validateNameBlur}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Name"
            accessibilityHint={nameError ? nameError : undefined}
          />
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </View>

        {/* Username Input */}
        <View>
          <View style={styles.usernameInputContainer}>
            <TextInput
              style={[
                styles.input,
                (usernameRequiredError ||
                  usernameFormatError ||
                  usernameStatus === 'taken' ||
                  usernameStatus === 'error')
                  ? styles.inputError
                  : null,
              ]}
              placeholder="Username"
              placeholderTextColor={colors.brownText}
              value={username}
              onChangeText={handleUsernameChange}
              onBlur={handleUsernameBlur}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={MAX_USERNAME_LENGTH}
              accessibilityLabel="Username"
              accessibilityHint={
                usernameRequiredError ||
                (usernameStatus === 'available'
                  ? 'Username available'
                  : usernameStatus === 'taken'
                    ? 'Username taken'
                    : usernameStatus === 'error'
                      ? 'Unable to check availability'
                      : usernameFormatError || undefined)
              }
            />
            {usernameStatus === 'checking' && (
              <ActivityIndicator size="small" color={colors.primaryBlue} style={styles.checkingIndicator} />
            )}
          </View>
          {usernameRequiredError ? (
            <Text style={styles.errorText}>{usernameRequiredError}</Text>
          ) : usernameFormatError ? (
            <Text style={styles.errorText}>{usernameFormatError}</Text>
          ) : usernameStatus === 'available' ? (
            <Text style={styles.successText}>✓ Username available</Text>
          ) : usernameStatus === 'taken' ? (
            <Text style={styles.errorText}>✗ Username taken</Text>
          ) : usernameStatus === 'error' ? (
            <TouchableOpacity onPress={handleRetryUsernameCheck} accessible accessibilityRole="button">
              <Text style={[styles.errorText, styles.retryText]}>
                Unable to check availability. Try again.
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Email Input */}
        <View>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            placeholder="Email"
            placeholderTextColor={colors.brownText}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError('');
            }}
            onBlur={validateEmailBlur}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email"
            accessibilityHint={emailError || undefined}
          />
          {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
        </View>

        {/* Phone Input (optional) */}
        <View>
          <View style={styles.phoneRow}>
            <View style={styles.areaCodeBox}>
              <Text style={styles.areaCodeText}>+1</Text>
            </View>
            <TextInput
              style={[styles.phoneInput, phoneError ? styles.inputError : null]}
              placeholder="Phone (optional)"
              placeholderTextColor={colors.brownText}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError('');
              }}
              onBlur={validatePhoneBlur}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Phone number, optional"
              accessibilityHint={phoneError ? phoneError : 'US numbers only'}
            />
          </View>
          <Text style={styles.phoneNote}>We only support US numbers (+1) right now.</Text>
          {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
        </View>

        {/* Password Input */}
        <View>
          <TextInput
            style={[styles.input, passwordError ? styles.inputError : null]}
            placeholder="Password"
            placeholderTextColor={colors.brownText}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError('');
            }}
            onBlur={validatePasswordBlur}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Password"
            accessibilityHint={passwordError || undefined}
          />
          {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          <View style={styles.passwordChecklist}>
            {PASSWORD_REQUIREMENTS.map((req) => {
              const met = req.check(password);
              return (
                <Text
                  key={req.key}
                  style={[styles.checklistItem, met ? styles.checklistMet : styles.checklistUnmet]}
                  accessibilityLabel={req.label}
                  accessibilityState={{ checked: met }}
                >
                  {met ? '✓' : '○'} {req.label}
                </Text>
              );
            })}
          </View>
        </View>

        {/* Confirm Password Input */}
        <View>
          <TextInput
            style={[
              styles.input,
              confirmPasswordTouched &&
                confirmPassword.length > 0 &&
                password !== confirmPassword &&
                styles.inputError,
            ]}
            placeholder="Confirm Password"
            placeholderTextColor={colors.brownText}
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              setConfirmPasswordTouched(true);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Confirm password"
            accessibilityHint={
              confirmPasswordTouched && confirmPassword.length > 0
                ? password === confirmPassword
                  ? 'Passwords match'
                  : 'Passwords do not match'
                : undefined
            }
          />
          {confirmPasswordTouched && confirmPassword.length > 0 && (
            <>
              {password === confirmPassword ? (
                <Text style={styles.successText}>✓ Passwords match</Text>
              ) : (
                <Text style={styles.errorText}>✗ Passwords don't match</Text>
              )}
            </>
          )}
        </View>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, !isFormValid && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!isFormValid}
          accessibilityRole="button"
          accessibilityLabel="Next"
          accessibilityState={{ disabled: !isFormValid }}
        >
          <Text style={styles.nextButtonText}>Next</Text>
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
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  areaCodeBox: {
    height: 50,
    minWidth: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  areaCodeText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.white,
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  phoneNote: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.brownText,
    opacity: 0.8,
    marginBottom: 12,
    marginLeft: 4,
  },
  nextButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
  usernameInputContainer: {
    position: 'relative',
  },
  checkingIndicator: {
    position: 'absolute',
    right: 16,
    top: 15,
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
  retryText: {
    textDecorationLine: 'underline',
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
});
