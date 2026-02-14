import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import iconImage from '../../../../assets/icon.png';
import appleIcon from '../../../../assets/apple.png';
import googleIcon from '../../../../assets/google.png';

interface SignInScreenProps {
  onSignUp?: () => void;
}

export default function SignInScreen({ onSignUp }: SignInScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const { signIn, signInWithApple, signInWithGoogle } = useAuth();

  const handleSignIn = async () => {
    if (!identifier || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      await signIn(identifier, password);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={iconImage}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

        {/* Tagline */}
        <Text style={styles.tagline}>you read it,{"\n"}you rank it!</Text>

        {/* Email or Username Input */}
        <TextInput
          style={styles.input}
          placeholder="Username or email"
          placeholderTextColor={colors.brownText}
          value={identifier}
          onChangeText={setIdentifier}
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
          onSubmitEditing={handleSignIn}
        />

        {/* Sign In Button */}
        <TouchableOpacity
          style={[styles.signInButton, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={Boolean(loading)}
        >
          <Text style={styles.signInButtonText}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        {/* Separator */}
        <View style={styles.separator}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>or</Text>
          <View style={styles.separatorLine} />
        </View>

        {/* Apple Sign In */}
        <TouchableOpacity
          style={[styles.appleButton, oauthLoading === 'apple' && styles.buttonDisabled]}
          onPress={async () => {
            try {
              setOauthLoading('apple');
              await signInWithApple();
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
            style={styles.appleIcon} 
            resizeMode="contain"
            tintColor={colors.white}
          />
          <Text style={styles.appleButtonText}>
            {oauthLoading === 'apple' ? 'Signing in...' : 'Sign in with Apple'}
          </Text>
        </TouchableOpacity>

        {/* Google Sign In */}
        <TouchableOpacity
          style={[styles.googleButton, oauthLoading === 'google' && styles.buttonDisabled]}
          onPress={async () => {
            try {
              setOauthLoading('google');
              await signInWithGoogle();
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
            style={styles.googleIcon} 
            resizeMode="contain"
          />
          <Text style={styles.googleButtonText}>
            {oauthLoading === 'google' ? 'Signing in...' : 'Sign in with Google'}
          </Text>
        </TouchableOpacity>

          {/* Sign Up Link */}
          <TouchableOpacity onPress={onSignUp} style={styles.signUpContainer}>
            <Text style={styles.signUpText}>
              Don't have an account? <Text style={styles.signUpLink}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
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
  scrollView: {
    flex: 1,
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
  tagline: {
    fontSize: 30,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 36,
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
  signInButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signInButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
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
  appleButton: {
    backgroundColor: colors.brownText,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appleIcon: {
    width: 24,
    height: 24,
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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  googleButtonText: {
    color: colors.brownText,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '500',
  },
  signUpContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  signUpText: {
    color: colors.brownText,
    fontFamily: typography.body,
    fontSize: 14,
    textAlign: 'center',
  },
  signUpLink: {
    color: colors.primaryBlue,
    fontWeight: '500',
  },
});
