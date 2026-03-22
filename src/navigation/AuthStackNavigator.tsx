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
import EnterCodeScreen from '../features/auth/screens/EnterCodeScreen';
import ResetPasswordScreen from '../features/auth/screens/ResetPasswordScreen';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';
import { updatePrivateData } from '../services/userPrivateData';
import { acceptInviteByPhone } from '../services/invites';
import type { ContactEntry } from '../features/onboarding/screens/DiscoverFriendsScreen';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  CreateAccount: undefined;
  SignUpEmail: undefined;
  ForgotPassword: undefined;
  EnterCode: { email: string };
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
  const { /* signInWithApple, signInWithGoogle, */ signUp } = useAuth();

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
            onSignUp={() => props.navigation.navigate('SignUpEmail')}
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

      <Stack.Screen name="EnterCode">
        {(props) => (
          <EnterCodeScreen
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

      {/* CreateAccount OAuth: pass onAppleSignIn / onGoogleSignIn again when restoring; useAuth().signInWithApple / signInWithGoogle */}
      <Stack.Screen name="CreateAccount">
        {(props) => (
          <CreateAccountScreen
            {...props}
            onEmailSignUp={() => props.navigation.navigate('SignUpEmail')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="SignUpEmail">
        {(props) => (
          <SignUpEmailScreen
            {...props}
            onNext={async (email, password, name, username, phone) => {
              await signUp(email, password, username, name, []);
              const { data } = await supabase.auth.getSession();
              const userId = data?.session?.user?.id;
              if (userId) {
                const { error: ageError } = await supabase
                  .from('user_profiles')
                  .update({ age_confirmed_at: new Date().toISOString() })
                  .eq('user_id', userId);
                if (ageError) {
                  console.warn('age_confirmed_at update failed', ageError);
                }
                if (phone) {
                  await updatePrivateData(userId, { phone_number: phone });
                  await acceptInviteByPhone();
                }
              }
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
        {() => <DiscoverFriendsScreen onSkip={onInviteGateCleared} />}
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
