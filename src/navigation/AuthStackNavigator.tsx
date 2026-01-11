import React, { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import WelcomeScreen from '../features/auth/screens/WelcomeScreen';
import CreateAccountScreen from '../features/auth/screens/CreateAccountScreen';
import SignUpEmailScreen from '../features/auth/screens/SignUpEmailScreen';
import SetupProfileScreen from '../features/auth/screens/SetupProfileScreen';
import ReadingInterestsScreen from '../features/auth/screens/ReadingInterestsScreen';
import SignInScreen from '../features/auth/screens/SignInScreen';
import { useAuth } from '../contexts/AuthContext';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  CreateAccount: undefined;
  SignUpEmail: undefined;
  SetupProfile: {
    email: string;
    password: string;
  };
  ReadingInterests: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    username: string;
  };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStackNavigator() {
  const { signUp, signInWithApple, signInWithGoogle } = useAuth();
  const [signUpData, setSignUpData] = useState<{
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    interests?: string[];
  }>({});

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
      initialRouteName="Welcome"
    >
      <Stack.Screen name="Welcome">
        {(props) => (
          <WelcomeScreen
            {...props}
            onGetStarted={() => props.navigation.navigate('SignIn')}
            onSignIn={() => props.navigation.navigate('SignIn')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="SignIn">
        {(props) => (
          <SignInScreen
            {...props}
            onSignUp={() => props.navigation.navigate('CreateAccount')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="CreateAccount">
        {(props) => (
          <CreateAccountScreen
            {...props}
            onAppleSignIn={async () => {
              try {
                await signInWithApple();
              } catch (error: any) {
                // Error handling is done in the OAuth method
                console.error('Apple Sign In error:', error);
              }
            }}
            onGoogleSignIn={async () => {
              try {
                await signInWithGoogle();
              } catch (error: any) {
                // Error handling is done in the OAuth method
                console.error('Google Sign In error:', error);
              }
            }}
            onEmailSignUp={() => props.navigation.navigate('SignUpEmail')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="SignUpEmail">
        {(props) => (
          <SignUpEmailScreen
            {...props}
            onNext={(email, password) => {
              setSignUpData({ email, password });
              props.navigation.navigate('SetupProfile', { email, password });
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="SetupProfile">
        {(props) => (
          <SetupProfileScreen
            {...props}
            onNext={(firstName, lastName, username) => {
              const { email, password } = props.route.params;
              setSignUpData((prev) => ({ ...prev, firstName, lastName, username }));
              props.navigation.navigate('ReadingInterests', {
                email,
                password,
                firstName,
                lastName,
                username,
              });
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="ReadingInterests">
        {(props) => (
          <ReadingInterestsScreen
            {...props}
            onComplete={async (interests, onError) => {
              const { email, password, firstName, lastName, username } = props.route.params;
              try {
                // Create the account with Supabase - profile will be created automatically by trigger
                // Pass username and other data as metadata so trigger can use it
                await signUp(email, password, username, firstName, lastName, interests);
                
                console.log('Signup complete - profile should be created automatically');
              } catch (error: any) {
                console.error('Error completing signup:', error);
                if (onError) {
                  onError(
                    error.message || 'Failed to create account. Please try again.'
                  );
                }
              }
            }}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
