import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { colors, typography } from '../../../config/theme';
import { useInviteTier } from '../../../hooks/useInviteTier';
import { createInviteLinkForContact } from '../../../services/invites';
import ContactInvitePicker, { type ContactEntry } from '../components/ContactInvitePicker';
import { normalizePhone } from '../../../utils/phone';

const INVITE_MESSAGE_PREFIX =
  "HELLO i've been ranking all my books on inkli and i think you'd love it. join me? (this invite is only valid for 24 hours so act fast!) (˶ˆᗜˆ˵)\n";

const REQUIRED_SELECTIONS = 4;

type Status = 'requesting' | 'loading' | 'denied' | 'ready' | 'empty';

export default function InviteContactsPickerScreen() {
  const navigation = useNavigation();
  const { refetch } = useInviteTier();
  const [status, setStatus] = useState<Status>('requesting');
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const loadContacts = useCallback(async () => {
    setStatus('loading');
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
      setContacts(list);
      setStatus(list.length === 0 ? 'empty' : 'ready');
    } catch (e) {
      console.warn('InviteContactsPickerScreen: loadContacts error', e);
      setStatus('empty');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { status: permStatus } = await Contacts.requestPermissionsAsync();
      if (permStatus === 'granted') {
        await loadContacts();
      } else {
        setStatus('denied');
      }
    })();
  }, [loadContacts]);

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
        if (error || !url) continue;
        const message = `${INVITE_MESSAGE_PREFIX}${url}`;
        await SMS.sendSMSAsync([phone], message);
      }
      await refetch();
      navigation.goBack();
    } catch (e) {
      console.warn('InviteContactsPickerScreen: handleSendInvites error', e);
      Alert.alert('Error', 'Something went wrong sending invites. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Invite from contacts</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (status === 'requesting' || status === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {renderHeader()}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={styles.statusText}>
            {status === 'requesting' ? 'Requesting contacts access...' : 'Loading contacts...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'denied') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {renderHeader()}
        <View style={styles.centered}>
          <Text style={styles.statusText}>Contacts access is needed to invite friends.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Open settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'empty') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {renderHeader()}
        <View style={styles.centered}>
          <Text style={styles.statusText}>No contacts found.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {renderHeader()}
      <ContactInvitePicker
        title="Invite 4 friends"
        subtitle="Select 4 contacts to invite to Inkli! For each one that joins, you'll earn points to unlock bonus features."
        requiredSelections={REQUIRED_SELECTIONS}
        contacts={contacts}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    marginTop: Platform.OS === 'ios' ? 8 : 16,
    marginLeft: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.brownText,
    fontWeight: 'bold',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statusText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.white,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
});
