import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { colors, typography } from '../../../config/theme';

export interface ContactEntry {
  name: string;
  phone: string;
}

interface ContactInvitePickerProps {
  title: string;
  subtitle: string;
  requiredSelections?: number;
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
  const [query, setQuery] = useState('');
  const selectionCount = selectedPhones.size;
  const canSend = requiredSelections != null
    ? selectionCount === requiredSelections
    : selectionCount >= 1;

  const filteredContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    if (!query.trim()) return sorted;
    const lower = query.toLowerCase();
    return sorted.filter((c) => c.name.toLowerCase().includes(lower));
  }, [contacts, query]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.selectionCount}>
          {requiredSelections != null
            ? `${selectionCount}/${requiredSelections} selected`
            : `${selectionCount} selected`}
        </Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts…"
          placeholderTextColor={`${colors.brownText}66`}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filteredContacts.map((contact) => {
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
              <Text style={styles.contactName}>{contact.name}</Text>
              {selected && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.stickyFooter}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 12,
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
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.9,
  },
  selectionCount: {
    fontFamily: typography.button,
    fontSize: 15,
    color: colors.primaryBlue,
    textAlign: 'center',
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.brownText,
    borderWidth: 1,
    borderColor: `${colors.brownText}22`,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
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
  contactName: {
    flex: 1,
    fontFamily: typography.body,
    fontSize: 15,
    fontWeight: '500',
    color: colors.brownText,
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
  stickyFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: colors.creamBackground,
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
