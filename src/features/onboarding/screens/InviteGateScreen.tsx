import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, typography } from '../../../config/theme';
import { useInviteTier } from '../../../hooks/useInviteTier';
import {
  shareInviteLink,
  getPendingInviteCode,
  acceptInvite,
  clearPendingInviteCode,
} from '../../../services/invites';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../config/supabase';
import { updatePrivateData } from '../../../services/userPrivateData';

export type InviteGateSignupParams = {
  email: string;
  password: string;
  name: string;
  username: string;
  phone?: string | null;
};

interface InviteGateScreenProps {
  signupParams?: InviteGateSignupParams;
  onInviteGateCleared?: () => void;
}

export default function InviteGateScreen({
  signupParams,
  onInviteGateCleared,
}: InviteGateScreenProps) {
  const { user, signUp } = useAuth();
  const navigation = useNavigation();
  const {
    sentCount,
    inviteCount,
    isWallCleared,
    loading,
    refetch,
  } = useInviteTier();

  const [sharing, setSharing] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);

  // Create account when arriving from email signup (before invite gate)
  useEffect(() => {
    if (user) {
      setSignupComplete(true);
      return;
    }
    if (!signupParams) {
      setSignupComplete(true);
      return;
    }

    let cancelled = false;
    setSigningUp(true);
    (async () => {
      try {
        await signUp(
          signupParams.email,
          signupParams.password,
          signupParams.username,
          signupParams.name,
          []
        );
        if (cancelled) return;
        const phone = signupParams.phone?.trim();
        if (phone) {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData?.session?.user?.id;
          if (userId) {
            await updatePrivateData(userId, { phone_number: phone });
          }
        }
        if (!cancelled) setSignupComplete(true);
      } catch (error: any) {
        if (cancelled) return;
        Alert.alert(
          'Signup Error',
          error.message || 'Failed to create account. Please try again.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } finally {
        if (!cancelled) setSigningUp(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, signupParams?.email]);

  useEffect(() => {
    if (isWallCleared) {
      onInviteGateCleared?.();
    }
  }, [isWallCleared, onInviteGateCleared]);

  // Only attempt to accept a pending invite once the account is ready.
  // Permanently clear the code on success or known-permanent errors; keep it
  // for transient failures so a retry is possible on the next mount.
  const PERMANENT_INVITE_ERRORS = [
    'already been used',
    'already been linked',
    'cannot use your own invite code',
    'Invalid or expired invite code',
  ];

  useEffect(() => {
    if (!signupComplete) return;
    let cancelled = false;
    (async () => {
      const code = await getPendingInviteCode();
      if (cancelled || !code) return;
      const { error } = await acceptInvite(code);
      if (cancelled) return;
      if (!error || PERMANENT_INVITE_ERRORS.some((msg) => error.includes(msg))) {
        await clearPendingInviteCode();
      }
      if (error) {
        console.warn('InviteGateScreen: acceptInvite failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupComplete]);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareInviteLink();
      refetch();
    } finally {
      setSharing(false);
    }
  };

  const waitingForSignup = signupParams && !signupComplete;
  if (loading || signingUp || waitingForSignup) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Before you go in...</Text>
        <Text style={styles.subtitle}>
          Send your invite link to 4 friends to unlock the full Inkli experience. When they join,
          you’ll earn unlock points for extra features.
        </Text>

        <View style={styles.progressCard}>
          <Text style={styles.progressMain}>
            {sentCount}/4 invites sent
          </Text>
          <Text style={styles.progressSub}>
            {inviteCount} friend{inviteCount !== 1 ? 's' : ''} joined so far
          </Text>
        </View>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          activeOpacity={0.8}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.shareButtonText}>Share invite link</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  title: {
    fontFamily: typography.heroTitle,
    fontSize: 26,
    color: colors.brownText,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    lineHeight: 24,
    marginBottom: 28,
    textAlign: 'center',
    opacity: 0.9,
  },
  progressCard: {
    backgroundColor: colors.white,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  progressMain: {
    fontFamily: typography.button,
    fontSize: 20,
    color: colors.primaryBlue,
    marginBottom: 4,
  },
  progressSub: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    opacity: 0.8,
  },
  shareButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  shareButtonText: {
    fontFamily: typography.button,
    fontSize: 17,
    color: colors.white,
  },
});
