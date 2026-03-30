import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getAuthRedirectUri } from '../utils/authRedirect';
import { looksLikePhone, normalizePhone } from '../utils/phone';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';

// Complete auth session for better UX
WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  pendingPasswordRecovery: boolean;
  setPendingPasswordRecovery: (value: boolean) => void;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username?: string, name?: string, readingInterests?: string[]) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPasswordRecovery, setPendingPasswordRecovery] = useState(false);

  useEffect(() => {
    // Configure Google Sign-In
    // Client IDs are read from Info.plist (set by config plugin)
    // This is secure because client IDs are public (no secrets involved)
    try {
      GoogleSignin.configure({
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      });
    } catch (error) {
      console.warn('Google Sign-In configuration warning:', error);
      // Non-fatal - will show error when user tries to sign in
    }

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPendingPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setPendingPasswordRecovery(false);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (identifier: string, password: string) => {
    const trimmedIdentifier = identifier.trim();
    let email: string;

    if (trimmedIdentifier.includes('@')) {
      email = trimmedIdentifier;
    } else if (looksLikePhone(trimmedIdentifier)) {
      const normalized = normalizePhone(trimmedIdentifier);
      if (!normalized) {
        throw new Error('Please enter a valid phone number');
      }
      const { data, error } = await supabase.functions.invoke('resolve-phone', {
        body: { phone: normalized },
      });
      if (error) throw error;
      email = data?.email ?? '';
      if (!email) {
        throw new Error('No account found with that phone number');
      }
    } else {
      const { data, error } = await supabase.functions.invoke('resolve-username', {
        body: { username: trimmedIdentifier },
      });
      if (error) throw error;
      email = data?.email ?? '';
      if (!email) {
        throw new Error('No account found with that username');
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    setSession(data.session);
    setUser(data.user);
    const { error: reactivateError } = await supabase
      .from('user_profiles')
      .update({ deactivated_at: null })
      .eq('user_id', data.user.id);
    if (reactivateError) {
      console.error('Failed to clear deactivated_at on sign-in:', reactivateError);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    username?: string,
    name?: string,
    readingInterests?: string[]
  ) => {
    try {

      // Sign up with username and other data in metadata (trigger will use it)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            name: name,
            reading_interests: readingInterests || [],
          }
        }
      });

      if (error) {
        console.error('Auth signup error:', error);
        throw error;
      }

      if (!data.user) {
        throw new Error('No user returned from signup');
      }


      // Wait a moment for trigger to create profile
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify profile was created
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (profileError || !profile) {
        console.error('Profile not created by trigger, creating manually...');

        // Fallback: create manually if trigger failed
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: data.user.id,
            username: username || 'user_' + data.user.id.substring(0, 8),
            name: name || 'User',
            member_since: new Date().toISOString(),
            books_read_count: 0,
            global_rank: null,
            reading_interests: readingInterests || [],
          });

        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error('Username already taken');
          }
          console.error('Failed to create profile manually:', insertError);
          // Don't throw - user is created, profile can be fixed later
        }
      }

      setSession(data.session);
      setUser(data.user);
    } catch (error) {
      console.error('Error completing signup:', error);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
  };

  const signInWithApple = async () => {
    try {
      const redirectUri = getAuthRedirectUri();

      let idToken: string | null = null;

      // On iOS, use native Apple Authentication for better UX
      const isAppleAvailable = Platform.OS === 'ios' && await AppleAuthentication.isAvailableAsync();
      if (isAppleAvailable) {
        try {
          // Generate nonce for Supabase token verification (required for signInWithIdToken)
          const nonceBytes = await Crypto.getRandomBytesAsync(32);
          const rawNonce = Array.from(nonceBytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            nonce: rawNonce,
          });

          if (!credential.identityToken) {
            throw new Error('Apple Sign In failed - no identity token');
          }

          idToken = credential.identityToken;

          // Sign in with Supabase using the OAuth token (same nonce required for verification)
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: idToken,
            nonce: rawNonce,
          });

          if (error) throw error;

          // Persist full name on first sign-in (Apple only sends it once)
          if (credential.fullName) {
            const fullName = [credential.fullName.givenName, credential.fullName.familyName]
              .filter(Boolean)
              .join(' ')
              .trim();
            if (fullName) {
              await supabase.auth.updateUser({
                data: {
                  full_name: fullName,
                  given_name: credential.fullName.givenName ?? undefined,
                  family_name: credential.fullName.familyName ?? undefined,
                },
              });
            }
          }

          // Ensure profile is created (trigger should handle it, but add fallback)
          await ensureUserProfile(data.user);

          setSession(data.session);
          setUser(data.user);
          {
            const { error: reactivateError } = await supabase
              .from('user_profiles')
              .update({ deactivated_at: null })
              .eq('user_id', data.user.id);
            if (reactivateError) {
              console.error('Failed to clear deactivated_at on sign-in:', reactivateError);
            }
          }
          return;
        } catch (error: any) {
          if (error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED') {
            // User cancelled, don't throw error
            return;
          }
          // Fall through to web OAuth if native fails
        }
      }

      // Use web OAuth flow (for Android or if native fails)
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: false, // Use browser-based flow
        },
      });

      if (error) throw error;

      // Open the OAuth URL in browser
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUri
        );

        if (result.type !== 'success') {
          if (result.type === 'cancel') {
            // User cancelled, don't throw error
            return;
          }
          throw new Error('Apple Sign In was cancelled or failed');
        }

        // Extract code from URL (could be in query params or hash)
        const url = new URL(result.url);
        let code = url.searchParams.get('code');

        // If not in query params, check hash fragment
        if (!code && url.hash) {
          const hashParams = new URLSearchParams(url.hash.substring(1));
          code = hashParams.get('code');
        }

        // If still not found, try to extract from the full URL string as fallback
        if (!code) {
          const codeMatch = result.url.match(/[#&]code=([^&]+)/);
          code = codeMatch?.[1] ?? null;
        }

        if (!code) {
          throw new Error('No authorization code received');
        }

        // Exchange code for session
        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

        if (sessionError) throw sessionError;

        // Ensure profile is created
        if (sessionData.user) {
          await ensureUserProfile(sessionData.user);
          const { error: reactivateError } = await supabase
            .from('user_profiles')
            .update({ deactivated_at: null })
            .eq('user_id', sessionData.user.id);
          if (reactivateError) {
            console.error('Failed to clear deactivated_at on sign-in:', reactivateError);
          }
        }

        setSession(sessionData.session);
        setUser(sessionData.user);
      }
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED' ||
        error.message?.includes('cancelled') || error.message?.includes('cancel')) {
        // User cancelled, don't throw error
        return;
      }
      console.error('Apple Sign In error:', error);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      // Use native Google Sign-In SDK
      // Client IDs are configured in Info.plist (secure, public values)
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      if (signInResult.type === 'cancelled') {
        return;
      }
      const { idToken } = await GoogleSignin.getTokens();

      if (!idToken) {
        throw new Error('Google Sign In failed - no ID token received');
      }

      // Sign in with Supabase using the Google ID token
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) throw error;

      // Ensure profile is created (trigger should handle it, but add fallback)
      await ensureUserProfile(data.user);

      setSession(data.session);
      setUser(data.user);
      const { error: reactivateError } = await supabase
        .from('user_profiles')
        .update({ deactivated_at: null })
        .eq('user_id', data.user.id);
      if (reactivateError) {
        console.error('Failed to clear deactivated_at on sign-in:', reactivateError);
      }
    } catch (error: any) {
      // Handle user cancellation
      if (error.code === 'SIGN_IN_CANCELLED' ||
        error.code === '-5' ||
        error.code === 'ERR_REQUEST_CANCELED' ||
        error.code === 'ERR_CANCELED' ||
        error.message?.includes('cancelled') ||
        error.message?.includes('cancel')) {
        // User cancelled, don't throw error
        return;
      }
      console.error('Google Sign In error:', error);
      throw error;
    }
  };

  // Helper function to ensure user profile exists
  const ensureUserProfile = async (user: User) => {
    try {
      // Wait a moment for trigger to create profile
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if profile exists
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profile) {

        // Extract user info from OAuth metadata
        const metadata = user.user_metadata || {};
        const displayName = metadata.full_name || metadata.name ||
          [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim() || 'User';
        const email = user.email || '';
        const username = metadata.preferred_username ||
          metadata.username ||
          email.split('@')[0] ||
          'user_' + user.id.substring(0, 8);

        // Create profile manually
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            username: username,
            name: displayName,
            member_since: new Date().toISOString(),
            books_read_count: 0,
            global_rank: null,
            reading_interests: [],
          });

        if (insertError) {
          if (insertError.code === '23505') {
            // Username conflict, try with different username
            const { error: retryError } = await supabase
              .from('user_profiles')
              .insert({
                user_id: user.id,
                username: 'user_' + user.id.substring(0, 8),
                name: displayName,
                member_since: new Date().toISOString(),
                books_read_count: 0,
                global_rank: null,
                reading_interests: [],
              });
            if (retryError) {
              console.error('Failed to create profile:', retryError);
            }
          } else {
            console.error('Failed to create profile:', insertError);
          }
        }
      }
    } catch (error) {
      console.error('Error ensuring user profile:', error);
      // Don't throw - profile creation is not critical for auth
    }
  };

  const contextValue: AuthContextType = {
    user,
    session,
    loading: Boolean(loading),
    pendingPasswordRecovery,
    setPendingPasswordRecovery,
    signIn,
    signUp,
    signOut,
    signInWithApple,
    signInWithGoogle,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
