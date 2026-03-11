import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import WelcomeScreen from '../features/auth/screens/WelcomeScreen';
import CreateAccountScreen from '../features/auth/screens/CreateAccountScreen';
import SignUpEmailScreen from '../features/auth/screens/SignUpEmailScreen';
import QuizScreen from '../features/onboarding/screens/QuizScreen';
import InviteGateScreen from '../features/onboarding/screens/InviteGateScreen';
import DiscoverFriendsScreen from '../features/onboarding/screens/DiscoverFriendsScreen';
import SignInScreen from '../features/auth/screens/SignInScreen';
import ForgotPasswordScreen from '../features/auth/screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../features/auth/screens/ResetPasswordScreen';
import { useAuth } from '../contexts/AuthContext';
import type { ContactEntry } from '../features/onboarding/screens/DiscoverFriendsScreen';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  CreateAccount: undefined;
  SignUpEmail: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  Quiz:
    | {
        email: string;
        password: string;
        name: string;
        username: string;
        phone?: string | null;
      }
    | undefined;
  DiscoverFriends: undefined;
  InviteGate:
    | {
        email?: string;
        password?: string;
        name?: string;
        username?: string;
        phone?: string | null;
        unmatchedContacts?: ContactEntry[];
      }
    | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

interface AuthStackNavigatorProps {
  initialRouteName?: keyof AuthStackParamList;
  onQuizComplete?: () => void;
  onInviteGateCleared?: () => void;
  onPasswordReset?: () => void;
  successMessage?: string;
}

export default function AuthStackNavigator({
  initialRouteName = 'Welcome',
  onQuizComplete,
  onInviteGateCleared,
  onPasswordReset,
  successMessage,
}: AuthStackNavigatorProps) {
  const { signInWithApple, signInWithGoogle } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
      initialRouteName={initialRouteName}
    >
      <Stack.Screen
        name="Welcome"
        options={{
          animation: 'fade',
        }}
      >
        {(props) => (
          <WelcomeScreen
            {...props}
            onComplete={() => props.navigation.replace('SignIn')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="SignIn"
        options={{
          animation: 'fade',
        }}
      >
        {(props) => (
          <SignInScreen
            {...props}
            onSignUp={() => props.navigation.navigate('CreateAccount')}
            onForgotPassword={() => props.navigation.navigate('ForgotPassword')}
            successMessage={successMessage}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="ForgotPassword">
        {(props) => (
          <ForgotPasswordScreen
            {...props}
            onBack={() => props.navigation.goBack()}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="ResetPassword">
        {(props) => (
          <ResetPasswordScreen
            {...props}
            onComplete={onPasswordReset}
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
              } catch (error) {
                console.error('Apple Sign In error:', error);
              }
            }}
            onGoogleSignIn={async () => {
              try {
                await signInWithGoogle();
              } catch (error) {
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
            onNext={(email, password, name, username, phone) => {
              props.navigation.navigate('InviteGate', {
                email,
                password,
                name,
                username,
                phone: phone ?? null,
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
            }}
            onQuizComplete={onQuizComplete}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="DiscoverFriends">
        {() => <DiscoverFriendsScreen />}
      </Stack.Screen>

      <Stack.Screen name="InviteGate">
        {(props) => (
          <InviteGateScreen
            {...props}
            signupParams={
              props.route.params?.email
                ? {
                    email: props.route.params.email,
                    password: props.route.params.password,
                    name: props.route.params.name,
                    username: props.route.params.username,
                    phone: props.route.params.phone,
                  }
                : undefined
            }
            onInviteGateCleared={onInviteGateCleared}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
