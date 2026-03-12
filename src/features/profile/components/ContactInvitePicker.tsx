import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { colors, typography } from '../../../config/theme';

export interface ContactEntry {
  name: string;
  phone: string;
}

interface ContactInvitePickerProps {
  title: string;
  subtitle: string;
  requiredSelections: number;
  contacts: ContactEntry[];
  selectedPhones: Set<string>;
  onToggleContact: (phone: string) => void;
  onSendInvites: () => void | Promise<void>;
  sending: boolean;
}

export default function ContactInvitePicker({
  title,
  subtitle,
  requiredSelections,
  contacts,
  selectedPhones,
  onToggleContact,
  onSendInvites,
  sending,
}: ContactInvitePickerProps) {
  const selectionCount = selectedPhones.size;
  const canSend = selectionCount === requiredSelections;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <Text style={styles.selectionCount}>
        {selectionCount}/{requiredSelections} selected
      </Text>

      <View style={styles.contactList}>
        {contacts.map((contact) => {
          const selected = selectedPhones.has(contact.phone);
          return (
            <TouchableOpacity
              key={contact.phone}
              style={[styles.contactRow, selected && styles.contactRowSelected]}
              onPress={() => onToggleContact(contact.phone)}
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
        onPress={() => void onSendInvites()}
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
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
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
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.9,
  },
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
});
