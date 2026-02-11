import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../../../config/theme';
import { checkUsernameAvailability } from '../../../services/userProfile';
import iconImage from '../../../../assets/icon.png';

interface SignUpEmailScreenProps {
  onNext: (email: string, password: string, firstName: string, lastName: string, username: string) => void;
  onBack?: () => void;
}

export default function SignUpEmailScreen({ onNext, onBack: _onBack }: SignUpEmailScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);

  const validateUsername = async (value: string) => {
    if (value.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return false;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError('Username can only contain letters, numbers, and underscores');
      return false;
    }

    setCheckingUsername(true);
    const { available, error } = await checkUsernameAvailability(value);
    setCheckingUsername(false);

    if (error) {
      setUsernameError('Error checking username availability');
      return false;
    }

    if (!available) {
      setUsernameError('Username already taken');
      return false;
    }

    setUsernameError('');
    return true;
  };

  const handleUsernameChange = async (value: string) => {
    setUsername(value);
    setUsernameError('');

    if (value.length >= 3 && /^[a-zA-Z0-9_]+$/.test(value)) {
      await validateUsername(value);
    }
  };

  const handleNext = async () => {
    if (!email || !password || !confirmPassword || !firstName || !lastName || !username) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    const isValid = await validateUsername(username);
    if (!isValid) {
      return;
    }

    onNext(email, password, firstName, lastName, username);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={iconImage}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

        {/* Title */}
        <Text style={styles.title}>sign up with email</Text>

        {/* First Name Input */}
        <TextInput
          style={styles.input}
          placeholder="First Name"
          placeholderTextColor={colors.brownText}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {/* Last Name Input */}
        <TextInput
          style={styles.input}
          placeholder="Last Name"
          placeholderTextColor={colors.brownText}
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {/* Username Input */}
        <View>
          <View style={styles.usernameInputContainer}>
            <TextInput
              style={[styles.input, usernameError ? styles.inputError : null]}
              placeholder="Username"
              placeholderTextColor={colors.brownText}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {checkingUsername && (
              <ActivityIndicator
                size="small"
                color={colors.primaryBlue}
                style={styles.checkingIndicator}
              />
            )}
          </View>
          {usernameError ? (
            <Text style={styles.errorText}>{usernameError}</Text>
          ) : null}
        </View>

        {/* Email Input */}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.brownText}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Password Input */}
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

        {/* Confirm Password Input */}
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor={colors.brownText}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

          {/* Next Button */}
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
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
  nextButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
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
    borderColor: '#FF3B30',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    fontFamily: typography.body,
    marginTop: -12,
    marginBottom: 12,
    marginLeft: 4,
  },
});
