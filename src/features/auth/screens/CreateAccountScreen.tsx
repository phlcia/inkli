import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../../../config/theme';
import iconImage from '../../../../assets/icon.png';
import appleIcon from '../../../../assets/apple.png';
import googleIcon from '../../../../assets/google.png';
import emailIcon from '../../../../assets/email.png';

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
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={iconImage}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

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
          <Image
            source={appleIcon}
            style={[styles.oauthIcon, styles.appleIcon]}
            resizeMode="contain"
          />
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
          <Image
            source={googleIcon}
            style={styles.oauthIcon}
            resizeMode="contain"
          />
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
          <Image
            source={emailIcon}
            style={styles.oauthIcon}
            resizeMode="contain"
          />
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
    justifyContent: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 100,
    height: 100,
  },
  title: {
    fontSize: 30,
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
  oauthIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  appleIcon: {
    tintColor: colors.white,
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
  emailButtonText: {
    color: colors.brownText,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '500',
  },
});
