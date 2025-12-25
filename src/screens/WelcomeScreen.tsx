import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../config/theme';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export default function WelcomeScreen({ onGetStarted, onSignIn }: WelcomeScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>inkli</Text>
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>you read it,{"\n"}you rank it!</Text>

        {/* Get Started Button */}
        <TouchableOpacity style={styles.getStartedButton} onPress={onGetStarted}>
          <Text style={styles.getStartedButtonText}>Get Started</Text>
        </TouchableOpacity>

        {/* Sign In Link */}
        <TouchableOpacity onPress={onSignIn} style={styles.signInContainer}>
          <Text style={styles.signInText}>
            Have an account? <Text style={styles.signInLink}>Sign In</Text>
          </Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    width: 150,
    height: 150,
    borderRadius: 16,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 45,
    fontFamily: typography.logo,
    color: colors.white,
  },
  tagline: {
    fontSize: 30,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    marginBottom: 48,
    textAlign: 'center',
  },
  getStartedButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '60%',
    alignItems: 'center',
    marginBottom: 24,
  },
  getStartedButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
  signInContainer: {
    marginTop: 8,
  },
  signInText: {
    color: colors.brownText,
    fontFamily: typography.body,
    fontSize: 14,
    textAlign: 'center',
  },
  signInLink: {
    color: colors.brownText,
    fontWeight: '600',
  },
});
