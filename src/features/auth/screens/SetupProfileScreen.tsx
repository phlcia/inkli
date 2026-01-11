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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../../../config/theme';
import { checkUsernameAvailability } from '../../../services/userProfile';

interface SetupProfileScreenProps {
  onNext: (firstName: string, lastName: string, username: string) => void;
  onBack?: () => void;
}

export default function SetupProfileScreen({
  onNext,
  onBack,
}: SetupProfileScreenProps) {
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
    
    // Only check availability if username meets basic requirements
    if (value.length >= 3 && /^[a-zA-Z0-9_]+$/.test(value)) {
      await validateUsername(value);
    }
  };

  const handleNext = async () => {
    if (!firstName || !lastName || !username) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // Validate username before proceeding
    const isValid = await validateUsername(username);
    if (!isValid) {
      return;
    }

    onNext(firstName, lastName, username);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>set up your profile</Text>

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

        {/* Next Button */}
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next</Text>
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
