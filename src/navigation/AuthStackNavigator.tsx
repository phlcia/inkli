import React, { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import WelcomeScreen from '../features/auth/screens/WelcomeScreen';
import CreateAccountScreen from '../features/auth/screens/CreateAccountScreen';
import SignUpEmailScreen from '../features/auth/screens/SignUpEmailScreen';
import SetupProfileScreen from '../features/auth/screens/SetupProfileScreen';
import QuizScreen from '../features/onboarding/screens/QuizScreen';
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
  Quiz: {
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
              props.navigation.navigate('Quiz', {
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

      <Stack.Screen name="Quiz">
        {(props) => (
          <QuizScreen
            {...props}
            signupParams={props.route.params}
            onSignupComplete={() => {
              // Signup is handled inside QuizScreen
              // Navigation to main app happens automatically via AuthContext
            }}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
