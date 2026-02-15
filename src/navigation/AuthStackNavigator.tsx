import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import WelcomeScreen from '../features/auth/screens/WelcomeScreen';
import CreateAccountScreen from '../features/auth/screens/CreateAccountScreen';
import SignUpEmailScreen from '../features/auth/screens/SignUpEmailScreen';
import QuizScreen from '../features/onboarding/screens/QuizScreen';
import SignInScreen from '../features/auth/screens/SignInScreen';
import { useAuth } from '../contexts/AuthContext';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  CreateAccount: undefined;
  SignUpEmail: undefined;
  Quiz:
    | {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        username: string;
        phone?: string | null;
      }
    | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

interface AuthStackNavigatorProps {
  initialRouteName?: keyof AuthStackParamList;
  onQuizComplete?: () => void;
}

export default function AuthStackNavigator({
  initialRouteName = 'Welcome',
  onQuizComplete,
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
                // Error handling is done in the OAuth method
                console.error('Apple Sign In error:', error);
              }
            }}
            onGoogleSignIn={async () => {
              try {
                await signInWithGoogle();
              } catch (error) {
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
            onNext={(email, password, firstName, lastName, username, phone) => {
              props.navigation.navigate('Quiz', {
                email,
                password,
                firstName,
                lastName,
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
              // Navigation to main app happens automatically via AuthContext
            }}
            onQuizComplete={onQuizComplete}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
