import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { colors, typography } from '../../../config/theme';
import { useInviteTier } from '../../../hooks/useInviteTier';
import {
  createInviteLinkForContact,
  getPendingInviteCode,
  acceptInvite,
  acceptInviteByPhone,
  clearPendingInviteCode,
} from '../../../services/invites';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../config/supabase';
import { updatePrivateData } from '../../../services/userPrivateData';
import { normalizePhone } from '../../../utils/phone';
import type { AuthStackParamList } from '../../../navigation/AuthStackNavigator';
import type { ContactEntry } from './DiscoverFriendsScreen';
import ContactInvitePicker from '../../profile/components/ContactInvitePicker';

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

  const [signingUp, setSigningUp] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // When we have no contacts from route (denied at DiscoverFriends or direct nav to InviteGate): reprompt for permission and load contacts
  type ContactsPermissionStatus = 'requesting' | 'granted' | 'denied';
  const [contactsPermission, setContactsPermission] = useState<ContactsPermissionStatus>('requesting');
  const [loadedContacts, setLoadedContacts] = useState<ContactEntry[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const loadContactsForInvite = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const { data: contactData } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const seenPhones = new Set<string>();
      const list: ContactEntry[] = [];
      for (const contact of contactData ?? []) {
        const displayName = (contact.name ?? '').trim();
        for (const pn of contact.phoneNumbers ?? []) {
          const raw = pn.number ?? '';
          const normalized = normalizePhone(raw);
          if (normalized && !seenPhones.has(normalized)) {
            seenPhones.add(normalized);
            list.push({ name: displayName || normalized, phone: normalized });
          }
        }
      }
      setLoadedContacts(list);
      setContactsPermission('granted');
    } catch (e) {
      console.warn('InviteGateScreen: loadContactsForInvite error', e);
      setContactsPermission('denied');
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    if (unmatchedContacts.length > 0) return;
    let cancelled = false;
    (async () => {
      const { status } = await Contacts.getPermissionsAsync();
      if (cancelled) return;
      if (status === 'granted') {
        await loadContactsForInvite();
      } else {
        setContactsPermission(status === 'denied' ? 'denied' : 'requesting');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unmatchedContacts.length, loadContactsForInvite]);

  const requestContactsAndLoad = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      await loadContactsForInvite();
    } else {
      setContactsPermission('denied');
    }
  }, [loadContactsForInvite]);

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
            await acceptInviteByPhone();
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
        const { url, error } = await createInviteLinkForContact(phone);
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
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ContactInvitePicker
          title="invite 4 friends"
          subtitle="Select 4 contacts to invite to Inkli! For each one that joins, you'll earn points to unlock bonus features."
          requiredSelections={REQUIRED_SELECTIONS}
          contacts={unmatchedContacts}
          selectedPhones={selectedPhones}
          onToggleContact={toggleContact}
          onSendInvites={handleSendInvites}
          sending={sending}
        />
      </SafeAreaView>
    );
  }

  // ------- No contacts from route: reprompt for permission or show contact picker with loaded contacts -------
  if (loadingContacts) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (contactsPermission === 'denied' || contactsPermission === 'requesting') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Invite from contacts</Text>
          <Text style={styles.subtitle}>
            To invite friends to Inkli, we need access to your contacts. Choose 4 people to send an
            invite to — when they join, you'll earn unlock points.
          </Text>
          <View style={styles.progressCard}>
            <Text style={styles.progressMain}>{sentCount}/4 invites sent</Text>
            <Text style={styles.progressSub}>
              {inviteCount} friend{inviteCount !== 1 ? 's' : ''} joined so far
            </Text>
          </View>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={requestContactsAndLoad}
            activeOpacity={0.8}
          >
            <Text style={styles.shareButtonText}>Allow access to contacts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shareButton, styles.shareButtonSecondary]}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.8}
          >
            <Text style={styles.shareButtonSecondaryText}>Open Settings</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loadedContacts.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>No contacts found</Text>
          <Text style={styles.subtitle}>
            Add contacts in your phone's contacts app, then tap below to try again.
          </Text>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={loadContactsForInvite}
            activeOpacity={0.8}
            disabled={loadingContacts}
          >
            {loadingContacts ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.shareButtonText}>Try again</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ContactInvitePicker
        title="invite 4 friends"
        subtitle="Select 4 contacts to invite to Inkli! For each one that joins, you'll earn points to unlock bonus features."
        requiredSelections={REQUIRED_SELECTIONS}
        contacts={loadedContacts}
        selectedPhones={selectedPhones}
        onToggleContact={toggleContact}
        onSendInvites={handleSendInvites}
        sending={sending}
      />
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
    marginBottom: 12,
  },
  shareButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primaryBlue,
  },
  shareButtonText: {
    fontFamily: typography.button,
    fontSize: 17,
    color: colors.white,
  },
  shareButtonSecondaryText: {
    fontFamily: typography.button,
    fontSize: 17,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.brownText,
    opacity: 0.8,
    textAlign: 'center',
  },
});
