import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getAccountType,
  updateAccountType,
} from '../../../services/userProfile';
import type { AccountType } from '../../../services/userProfile';
import { getPrivateData, updatePrivateData } from '../../../services/userPrivateData';
import { normalizePhone } from '../../../utils/phone';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';

type AccountSettingsScreenNavigationProp = StackNavigationProp<
  ProfileStackParamList,
  'AccountSettings'
>;

export default function AccountSettingsScreen() {
  const navigation = useNavigation<AccountSettingsScreenNavigationProp>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('public');
  const [privacyUpdating, setPrivacyUpdating] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [privateResult, accountResult] = await Promise.all([
        getPrivateData(user.id),
        getAccountType(user.id),
      ]);
      const { data: privateData, error: privateErr } = privateResult;
      const { accountType: at, error: accountErr } = accountResult;

      if (privateErr || !privateData) {
        setEmail(user.email || '');
        setPhone('');
      } else {
        setEmail(privateData.email || '');
        const raw = privateData.phone_number || '';
        setPhone(raw.replace(/^\+1/, '').trim());
      }
      if (!accountErr) {
        setAccountType(at);
      }
    } catch (e) {
      console.error('Error loading account settings:', e);
      setError('Couldn\'t load settings');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleDone = () => {
    (navigation as any).navigate('ProfileMain');
  };

  const handleEmailBlur = async () => {
    if (!user) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    await updatePrivateData(user.id, { email: trimmed });
  };

  const handlePhoneBlur = async () => {
    if (!user || !phone.trim()) return;
    const normalized = normalizePhone(phone.trim(), 'US');
    if (!normalized) return;
    const { error: updateErr } = await updatePrivateData(user.id, {
      phone_number: normalized,
    });
    if (updateErr) {
      const code = (updateErr as { code?: string })?.code;
      if (code === '23505') {
        Alert.alert('Error', 'This phone number is already registered.');
      }
    }
  };

  const handleAccountTypeToggle = async (value: boolean) => {
    if (!user || privacyUpdating) return;
    const nextType: AccountType = value ? 'private' : 'public';
    if (nextType === accountType) return;
    setPrivacyUpdating(true);
    try {
      const result = await updateAccountType(user.id, nextType);
      if (result.error) throw result.error;
      setAccountType(nextType);
    } catch (e) {
      Alert.alert('Error', 'Failed to update profile visibility');
    } finally {
      setPrivacyUpdating(false);
    }
  };

  const handleDeactivatePlaceholder = () => {
    Alert.alert('Coming soon', 'Deactivate account will be available in a future update.');
  };

  const handleDeletePlaceholder = () => {
    Alert.alert('Coming soon', 'Delete account will be available in a future update.');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={styles.cancelButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & privacy</Text>
        <TouchableOpacity onPress={handleDone}>
          <Text style={styles.doneButton}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Contact Information */}
        <Text style={styles.sectionHeader}>Contact Information</Text>
        <View style={styles.section}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              onBlur={handleEmailBlur}
              placeholder="you@example.com"
              placeholderTextColor={colors.brownText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>

          <Text style={styles.label}>Phone</Text>
          <View style={styles.phoneRow}>
            <View style={styles.areaCodeBox}>
              <Text style={styles.areaCodeText}>+1</Text>
            </View>
            <View style={[styles.inputWrapper, styles.phoneInputWrapper]}>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                onBlur={handlePhoneBlur}
                placeholder="Enter your phone number"
                placeholderTextColor={colors.brownText}
                autoCapitalize="none"
                keyboardType="phone-pad"
              />
            </View>
          </View>
          <Text style={styles.phoneNote}>
            We only support US numbers (+1) right now.
          </Text>
        </View>

        {/* Privacy */}
        <Text style={styles.sectionHeader}>Privacy</Text>
        <View style={styles.section}>
          <View style={styles.privacyRow}>
            <Text style={styles.privacyLabel}>Private account</Text>
            <Switch
              value={accountType === 'private'}
              onValueChange={handleAccountTypeToggle}
              disabled={privacyUpdating}
              trackColor={{ false: `${colors.brownText}40`, true: colors.primaryBlue }}
              thumbColor={colors.white}
            />
          </View>
          <Text style={styles.privacyHint}>
            {accountType === 'private' ? 'Only approved followers can see your activity.' : 'Anyone can see your profile and activity.'}
          </Text>
        </View>

        {/* Account Actions */}
        <Text style={styles.sectionHeader}>Account Actions</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleDeactivatePlaceholder}>
            <Text style={styles.actionRowText}>Deactivate account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={handleDeletePlaceholder}>
            <Text style={[styles.actionRowText, styles.actionRowTextDanger]}>Delete account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.creamBackground,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primaryBlue,
    borderRadius: 12,
  },
  retryButtonText: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.white,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  cancelButton: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    fontWeight: '600',
  },
  doneButton: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
  sectionHeader: {
    fontFamily: typography.heroTitle,
    fontSize: 17,
    color: colors.brownText,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 10,
  },
  section: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: typography.label,
    color: colors.brownText,
    fontWeight: '500',
    marginBottom: 4,
    marginTop: 8,
  },
  inputWrapper: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
    paddingHorizontal: 18,
    height: 50,
    justifyContent: 'center',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  areaCodeBox: {
    height: 50,
    minWidth: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  areaCodeText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
  },
  phoneInputWrapper: {
    flex: 1,
  },
  input: {
    flex: 1,
    height: 50,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    paddingVertical: 0,
  },
  phoneNote: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.brownText,
    opacity: 0.8,
    marginTop: 4,
    marginBottom: 4,
    marginLeft: 4,
  },
  privacyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
    paddingHorizontal: 18,
    minHeight: 50,
    paddingVertical: 12,
  },
  privacyLabel: {
    fontSize: 16,
    fontFamily: typography.label,
    color: colors.brownText,
  },
  privacyHint: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.brownText,
    opacity: 0.8,
    marginTop: 6,
  },
  actionRow: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 8,
  },
  actionRowText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
  },
  actionRowTextDanger: {
    color: '#C53030',
  },
});
