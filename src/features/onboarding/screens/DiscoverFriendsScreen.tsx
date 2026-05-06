import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../config/supabase';
import { normalizePhone } from '../../../utils/phone';
import { followUser } from '../../../services/userProfile';
import type { AuthStackParamList } from '../../../navigation/AuthStackNavigator';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'DiscoverFriends'>;

interface DiscoverFriendsScreenProps {
  onSkip?: () => void;
}

interface MatchedUser {
  user_id: string;
  username: string;
  name: string;
  profile_photo_url: string | null;
}

export interface ContactEntry {
  name: string;
  phone: string; // normalized E.164
}

type ScreenStatus = 'requesting' | 'prompt' | 'loading' | 'denied' | 'done';

export default function DiscoverFriendsScreen({ onSkip }: DiscoverFriendsScreenProps) {
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const [screenStatus, setScreenStatus] = useState<ScreenStatus>('requesting');
  const [matchedUsers, setMatchedUsers] = useState<MatchedUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [allContacts, setAllContacts] = useState<ContactEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [awaitingSettingsReturn, setAwaitingSettingsReturn] = useState(false);

  const loadAndMatch = useCallback(async () => {
    setScreenStatus('loading');
    try {
      const { data: contactData } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      // Normalize and deduplicate phone numbers, keeping one entry per unique phone
      const seenPhones = new Set<string>();
      const contacts: ContactEntry[] = [];

      for (const contact of contactData ?? []) {
        const displayName = (contact.name ?? '').trim();
        for (const pn of contact.phoneNumbers ?? []) {
          const raw = pn.number ?? '';
          const normalized = normalizePhone(raw);
          if (normalized && !seenPhones.has(normalized)) {
            seenPhones.add(normalized);
            contacts.push({ name: displayName || normalized, phone: normalized });
          }
        }
      }

      setAllContacts(contacts);

      if (contacts.length === 0) {
        setMatchedUsers([]);
        setScreenStatus('done');
        return;
      }

      // Call match-contacts edge function
      const phones = contacts.map((c) => c.phone);
      const { data: response, error } = await supabase.functions.invoke<{
        matches?: {
          user_id: string;
          username: string;
          name: string | null;
          profile_photo_url: string | null;
          account_type: string;
        }[];
      }>('match-contacts', {
        body: { phones, userId: user?.id },
      });

      if (error) {
        console.warn('DiscoverFriendsScreen: match-contacts error', error);
        setScreenStatus('done');
        return;
      }

      const matches: MatchedUser[] = (response?.matches ?? []).map((m) => ({
        user_id: m.user_id,
        username: m.username,
        name: m.name ?? m.username,
        profile_photo_url: m.profile_photo_url,
      }));

      setMatchedUsers(matches);
      // Pre-select all matched users
      setSelectedUserIds(new Set(matches.map((m) => m.user_id)));
      setScreenStatus('done');
    } catch (e) {
      console.warn('DiscoverFriendsScreen: loadAndMatch error', e);
      setScreenStatus('done');
    }
  }, [user]);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.getPermissionsAsync();
      if (status === 'granted') {
        await loadAndMatch();
      } else if (status === 'denied') {
        setScreenStatus('denied');
      } else {
        setScreenStatus('prompt');
      }
    })();
  }, [loadAndMatch]);

  useEffect(() => {
    if (!awaitingSettingsReturn) return;

    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        setAwaitingSettingsReturn(false);
        const { status } = await Contacts.getPermissionsAsync();
        if (status === 'granted') {
          await loadAndMatch();
        }
      }
    });

    return () => subscription.remove();
  }, [awaitingSettingsReturn, loadAndMatch]);

  const handleRequestPermission = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      await loadAndMatch();
    } else {
      setScreenStatus('denied');
    }
  };

  const handleOpenSettings = () => {
    setAwaitingSettingsReturn(true);
    Linking.openSettings();
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleContinue = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Follow only selected users
      if (user && selectedUserIds.size > 0) {
        await Promise.allSettled(
          Array.from(selectedUserIds).map((userId) => followUser(user.id, userId))
        );
      }

      await supabase
        .from('user_profiles')
        .update({ completed_contact_discovery: true })
        .eq('user_id', user?.id);

      navigation.navigate('InviteGate', { unmatchedContacts: allContacts });
    } catch (e) {
      console.warn('DiscoverFriendsScreen: handleContinue error', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (screenStatus === 'requesting' || screenStatus === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={styles.loadingText}>
            {screenStatus === 'requesting'
              ? 'Requesting contacts access...'
              : 'Finding your friends on Inkli...'}
          </Text>
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
        <Text style={styles.title}>discover friends</Text>

        {screenStatus === 'prompt' ? (
          <>
            <Text style={styles.subtitle}>
              See which of your contacts are already on Inkli!
            </Text>
            <TouchableOpacity
              style={styles.allowButton}
              onPress={handleRequestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.allowButtonText}>Allow Contacts Access</Text>
            </TouchableOpacity>
          </>
        ) : screenStatus === 'denied' ? (
          <>
            <Text style={styles.subtitle}>
              Allow contacts access in Settings to see which of your friends are on Inkli.
            </Text>
            <TouchableOpacity
              style={styles.allowButton}
              onPress={handleOpenSettings}
              activeOpacity={0.8}
            >
              <Text style={styles.allowButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </>
        ) : matchedUsers.length === 0 ? (
          <Text style={styles.subtitle}>
            None of your contacts are on Inkli yet... but you can change that!
          </Text>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {matchedUsers.length} friend{matchedUsers.length !== 1 ? 's' : ''} already on Inkli
            </Text>

            <View style={styles.matchedList}>
              {matchedUsers.map((match) => {
                const selected = selectedUserIds.has(match.user_id);
                return (
                  <TouchableOpacity
                    key={match.user_id}
                    style={[styles.matchRow, selected && styles.matchRowSelected]}
                    onPress={() => toggleUser(match.user_id)}
                    activeOpacity={0.7}
                  >
                    {match.profile_photo_url ? (
                      <Image
                        source={{ uri: match.profile_photo_url }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={[styles.avatarFallback, !selected && styles.avatarFallbackUnselected]}>
                        <Text style={[styles.avatarInitial, !selected && styles.avatarInitialUnselected]}>
                          {(match.name || match.username)[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.matchInfo}>
                      <Text style={styles.matchName}>{match.name}</Text>
                      <Text style={styles.matchUsername}>@{match.username}</Text>
                    </View>
                    <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                      {selected && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.continueButton, saving && styles.disabledButton]}
          onPress={handleContinue}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
        {onSkip && (
          <TouchableOpacity onPress={onSkip} activeOpacity={0.7} style={styles.skipLink}>
            <Text style={styles.skipLinkText}>skip for now</Text>
          </TouchableOpacity>
        )}
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
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 16,
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.brownText,
    opacity: 0.8,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  title: {
    fontFamily: typography.heroTitle,
    fontSize: 28,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    lineHeight: 24,
    textAlign: 'center',
    opacity: 0.9,
    marginBottom: 6,
  },
  matchedList: {
    marginBottom: 28,
  },
  matchRow: {
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
  matchRowSelected: {
    borderColor: colors.primaryBlue,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarFallbackUnselected: {
    backgroundColor: colors.creamBackground,
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  avatarInitial: {
    fontFamily: typography.button,
    fontSize: 18,
    color: colors.white,
    fontWeight: '600',
  },
  avatarInitialUnselected: {
    color: colors.brownText,
  },
  matchInfo: {
    flex: 1,
  },
  matchName: {
    fontFamily: typography.body,
    fontSize: 15,
    fontWeight: '500',
    color: colors.brownText,
  },
  matchUsername: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.brownText,
    opacity: 0.65,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.brownText,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    opacity: 0.3,
  },
  checkboxChecked: {
    backgroundColor: colors.primaryBlue,
    borderColor: colors.primaryBlue,
    opacity: 1,
  },
  checkboxMark: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
  continueButtonText: {
    fontFamily: typography.button,
    fontSize: 17,
    color: colors.white,
    fontWeight: '600',
  },
  skipLink: {
    marginTop: 14,
    alignItems: 'center',
  },
  skipLinkText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    opacity: 0.5,
    textDecorationLine: 'underline',
  },
  allowButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  allowButtonText: {
    fontFamily: typography.button,
    fontSize: 17,
    color: colors.white,
    fontWeight: '600',
  },
});
