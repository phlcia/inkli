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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as SMS from 'expo-sms';
import { colors, typography } from '../../../config/theme';
import { useInviteTier } from '../../../hooks/useInviteTier';
import {
  shareInviteLink,
  createInviteLinkForContact,
  getPendingInviteCode,
  acceptInvite,
  clearPendingInviteCode,
} from '../../../services/invites';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../config/supabase';
import { updatePrivateData } from '../../../services/userPrivateData';
import type { AuthStackParamList } from '../../../navigation/AuthStackNavigator';
import type { ContactEntry } from './DiscoverFriendsScreen';

export type InviteGateSignupParams = {
  email?: string;
  password?: string;
  name?: string;
  username?: string;
  phone?: string | null;
};

interface InviteGateScreenProps {
  signupParams?: InviteGateSignupParams;
  onInviteGateCleared?: () => void;
}

const INVITE_MESSAGE_PREFIX =
  "HELLO i've been ranking all my books on inkli and i think you'd love it. join me? (this invite is only valid for 24 hours so act fast!) (˶ˆᗜˆ˵)\n";

const REQUIRED_SELECTIONS = 4;

const PERMANENT_INVITE_ERRORS = [
  'already been used',
  'already been linked',
  'cannot use your own invite code',
  'Invalid or expired invite code',
];

type RouteProps = RouteProp<AuthStackParamList, 'InviteGate'>;

export default function InviteGateScreen({
  signupParams: signupParamsProp,
  onInviteGateCleared,
}: InviteGateScreenProps) {
  const { user, signUp } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const routeParams = route.params;

  // Merge signup params from prop and route
  const signupParams: InviteGateSignupParams | undefined =
    signupParamsProp ??
    (routeParams?.email
      ? {
          email: routeParams.email,
          password: routeParams.password,
          name: routeParams.name,
          username: routeParams.username,
          phone: routeParams.phone,
        }
      : undefined);

  const unmatchedContacts: ContactEntry[] = routeParams?.unmatchedContacts ?? [];

  const {
    sentCount,
    inviteCount,
    isWallCleared,
    loading: tierLoading,
    refetch,
  } = useInviteTier();

  const [sharing, setSharing] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // ------- Account creation (when arriving from email signup) -------
  useEffect(() => {
    if (user) {
      setSignupComplete(true);
      return;
    }
    if (!signupParams?.email || !signupParams?.password) {
      setSignupComplete(true);
      return;
    }

    let cancelled = false;
    setSigningUp(true);
    (async () => {
      try {
        await signUp(
          signupParams.email!,
          signupParams.password!,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, signupParams?.email]);

  // ------- Wall-cleared detection -------
  useEffect(() => {
    if (isWallCleared) {
      onInviteGateCleared?.();
    }
  }, [isWallCleared, onInviteGateCleared]);

  // ------- Accept any pending deep-linked invite code -------
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

  // ------- Simple share handler (fallback mode) -------
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

  // ------- Contact-picker mode handlers -------
  const toggleContact = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else if (next.size < REQUIRED_SELECTIONS) {
        next.add(phone);
      }
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (sending || selectedPhones.size !== REQUIRED_SELECTIONS) return;

    const smsAvailable = await SMS.isAvailableAsync();
    if (!smsAvailable) {
      Alert.alert('SMS Unavailable', 'SMS is not available on this device.');
      return;
    }

    setSending(true);
    try {
      const phones = Array.from(selectedPhones);
      for (const phone of phones) {
        const { url, error } = await createInviteLinkForContact();
        if (error || !url) {
          console.warn('InviteGateScreen: createInviteLinkForContact error', error);
          continue;
        }
        const message = `${INVITE_MESSAGE_PREFIX}${url}`;
        await SMS.sendSMSAsync([phone], message);
      }
      refetch();
      // onInviteGateCleared will fire via the isWallCleared effect once the server
      // reflects the new sent_invites_count. Call it directly too for reliability.
      onInviteGateCleared?.();
    } catch (e) {
      console.warn('InviteGateScreen: handleSendInvites error', e);
      Alert.alert('Error', 'Something went wrong sending invites. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // ------- Loading state -------
  const waitingForSignup = signupParams?.email && !signupComplete;
  if (tierLoading || signingUp || waitingForSignup) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  // ------- Contact-picker mode -------
  if (unmatchedContacts.length > 0) {
    const selectionCount = selectedPhones.size;
    const canSend = selectionCount === REQUIRED_SELECTIONS;

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>invite 4 friends</Text>
          <Text style={styles.subtitle}>
            Select 4 contacts to invite to Inkli! For each one that joins, you'll earn points to unlock bonus features.
          </Text>

          <Text style={styles.selectionCount}>
            {selectionCount}/{REQUIRED_SELECTIONS} selected
          </Text>

          <View style={styles.contactList}>
            {unmatchedContacts.map((contact) => {
              const selected = selectedPhones.has(contact.phone);
              return (
                <TouchableOpacity
                  key={contact.phone}
                  style={[styles.contactRow, selected && styles.contactRowSelected]}
                  onPress={() => toggleContact(contact.phone)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.contactAvatar, selected && styles.contactAvatarSelected]}>
                    <Text style={[styles.contactInitial, selected && styles.contactInitialSelected]}>
                      {contact.name[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                  </View>
                  {selected && (
                    <View style={styles.checkmark}>
                      <Text style={styles.checkmarkText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSendInvites}
            disabled={!canSend || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.sendButtonText}>Send Invites</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------- Simple share mode (no contacts / fallback) -------
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Before you go in...</Text>
        <Text style={styles.subtitle}>
          Send your invite link to 4 friends to unlock the full Inkli experience. When they join,
          you'll earn unlock points for extra features.
        </Text>

        <View style={styles.progressCard}>
          <Text style={styles.progressMain}>{sentCount}/4 invites sent</Text>
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
    paddingBottom: 40,
  },

  // Shared
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
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.9,
  },

  // Contact-picker mode
  selectionCount: {
    fontFamily: typography.button,
    fontSize: 15,
    color: colors.primaryBlue,
    textAlign: 'center',
    marginBottom: 16,
  },
  contactList: {
    marginBottom: 24,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  contactRowSelected: {
    borderColor: colors.primaryBlue,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.creamBackground,
    borderWidth: 1,
    borderColor: colors.brownText,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarSelected: {
    backgroundColor: colors.primaryBlue,
    borderColor: colors.primaryBlue,
  },
  contactInitial: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.brownText,
    fontWeight: '600',
  },
  contactInitialSelected: {
    color: colors.white,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontFamily: typography.body,
    fontSize: 15,
    fontWeight: '500',
    color: colors.brownText,
  },
  contactPhone: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.brownText,
    opacity: 0.6,
    marginTop: 2,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  checkmarkText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  sendButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    fontFamily: typography.button,
    fontSize: 17,
    color: colors.white,
    fontWeight: '600',
  },

  // Simple share mode
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
