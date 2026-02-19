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
  Modal,
  Keyboard,
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
import { deactivateAccount, deleteAccount, updatePassword } from '../../../services/account';
import { normalizePhone } from '../../../utils/phone';
import {
  EMAIL_REGEX,
  ERROR_RED,
  PASSWORD_REQUIREMENTS,
  SUCCESS_GREEN,
} from '../../../utils/validation';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';

type AccountSettingsScreenNavigationProp = StackNavigationProp<
  ProfileStackParamList,
  'AccountSettings'
>;

function isOAuthUser(user: {
  identities?: Array<{ provider?: string }>;
  app_metadata?: { provider?: string };
} | null): boolean {
  if (!user) return false;
  const hasOAuthIdentity =
    user.identities?.some(
      (i) => i.provider === 'google' || i.provider === 'apple'
    ) ?? false;
  const providerFromMeta = user.app_metadata?.provider as string | undefined;
  return (
    hasOAuthIdentity ||
    providerFromMeta === 'google' ||
    providerFromMeta === 'apple'
  );
}


function getPasswordErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const lower = msg.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Try again later.';
  if (lower.includes('session') || lower.includes('expired') || lower.includes('jwt')) return 'Session expired. Please sign in again.';
  if (msg.includes('Current password is incorrect')) return msg;
  if ((error as { status?: number })?.status === 422) return 'Password does not meet requirements.';
  return 'Failed to change password. Please try again.';
}

export default function AccountSettingsScreen() {
  const navigation = useNavigation<AccountSettingsScreenNavigationProp>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('public');
  const [privacyUpdating, setPrivacyUpdating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteInputValue, setDeleteInputValue] = useState('');
  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [changePasswordCurrent, setChangePasswordCurrent] = useState('');
  const [changePasswordNew, setChangePasswordNew] = useState('');
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [changePasswordCurrentError, setChangePasswordCurrentError] = useState('');
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

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
    if (!trimmed) {
      setEmailError('Email is required');
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError('Please enter a valid email');
      return;
    }
    setEmailError('');
    await updatePrivateData(user.id, { email: trimmed });
  };

  const handlePhoneBlur = async () => {
    if (!user || !phone.trim()) {
      setPhoneError('');
      return;
    }
    const normalized = normalizePhone(phone.trim(), 'US');
    if (!normalized) {
      setPhoneError('Please enter a valid US phone number');
      return;
    }
    setPhoneError('');
    const { error: updateErr } = await updatePrivateData(user.id, {
      phone_number: normalized,
    });
    if (updateErr) {
      const code = (updateErr as { code?: string })?.code;
      if (code === '23505') {
        setPhoneError('This phone number is already registered');
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

  const handleDeactivate = () => {
    Alert.alert(
      'Deactivate Account',
      'Your profile will be hidden until you sign in again. You will be signed out immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setDeactivating(true);
            const { error } = await deactivateAccount(user.id);
            if (error) {
              setDeactivating(false);
              Alert.alert('Error', 'Failed to deactivate account. Please try again.');
              return;
            }
          },
        },
      ]
    );
  };

  const handleDeletePress = () => {
    setDeleteError(null);
    setDeleteInputValue('');
    setDeleteModalVisible(true);
  };

  const handleDeleteConfirm = async () => {
    Keyboard.dismiss();
    if (!user) return;
    const passwordOrConfirmation = deleteInputValue.trim();
    if (!passwordOrConfirmation) {
      setDeleteError(
        isOAuthUser(user)
          ? 'Please type DELETE to confirm'
          : 'Please enter your password'
      );
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteAccount(user.id, passwordOrConfirmation, isOAuthUser(user));
    if (error) {
      setDeleting(false);
      const msg = error instanceof Error ? error.message : 'Failed to delete account. Please try again.';
      setDeleteError(msg);
      return;
    }
    setDeleteModalVisible(false);
  };

  const handleDeleteModalClose = () => {
    if (!deleting) {
      setDeleteModalVisible(false);
      setDeleteError(null);
      setDeleteInputValue('');
    }
  };

  const handleChangePasswordPress = () => {
    setChangePasswordError(null);
    setChangePasswordCurrentError('');
    setChangePasswordCurrent('');
    setChangePasswordNew('');
    setChangePasswordConfirm('');
    setConfirmPasswordTouched(false);
    setChangePasswordModalVisible(true);
  };

  const handleChangePasswordClose = () => {
    if (!changingPassword) {
      setChangePasswordModalVisible(false);
      setChangePasswordError(null);
      setChangePasswordCurrentError('');
      setChangePasswordCurrent('');
      setChangePasswordNew('');
      setChangePasswordConfirm('');
      setConfirmPasswordTouched(false);
    }
  };

  const passwordRequirementsMet = PASSWORD_REQUIREMENTS.every((r) => r.check(changePasswordNew));
  const passwordsMatch = changePasswordNew === changePasswordConfirm && changePasswordConfirm.length > 0;
  const isChangePasswordValid =
    changePasswordCurrent.trim().length > 0 &&
    passwordRequirementsMet &&
    passwordsMatch;

  const handleChangePasswordSubmit = async () => {
    Keyboard.dismiss();
    if (!user) return;
    const current = changePasswordCurrent.trim();
    if (!current) {
      setChangePasswordCurrentError('Current password is required');
      return;
    }
    setChangePasswordCurrentError('');
    if (!passwordRequirementsMet || !passwordsMatch) return;
    const userEmail = user.email || email.trim();
    if (!userEmail) {
      setChangePasswordError('Email is required to change password');
      return;
    }
    setChangingPassword(true);
    setChangePasswordError(null);
    const { error } = await updatePassword(userEmail, current, changePasswordNew);
    setChangingPassword(false);
    if (error) {
      setChangePasswordError(getPasswordErrorMessage(error));
      return;
    }
    setChangePasswordModalVisible(false);
    setChangePasswordCurrent('');
    setChangePasswordNew('');
    setChangePasswordConfirm('');
    Alert.alert('Success', 'Your password has been updated.', [
      { text: 'OK', onPress: () => (navigation as any).navigate('ProfileMain') },
    ]);
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
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & privacy</Text>
        <TouchableOpacity onPress={handleDone}>
          <Text style={styles.doneButton}>Save</Text>
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
          <View style={[styles.inputWrapper, emailError ? styles.inputWrapperError : null]}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (emailError) setEmailError('');
              }}
              onBlur={handleEmailBlur}
              placeholder="you@example.com"
              placeholderTextColor={colors.brownText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>
          {emailError ? <Text style={styles.inlineError}>{emailError}</Text> : null}

          <Text style={styles.label}>Phone</Text>
          <View style={styles.phoneRow}>
            <View style={styles.areaCodeBox}>
              <Text style={styles.areaCodeText}>+1</Text>
            </View>
            <View style={[styles.inputWrapper, styles.phoneInputWrapper, phoneError ? styles.inputWrapperError : null]}>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (phoneError) setPhoneError('');
                }}
                onBlur={handlePhoneBlur}
                placeholder="Enter your phone number"
                placeholderTextColor={colors.brownText}
                autoCapitalize="none"
                keyboardType="phone-pad"
              />
            </View>
          </View>
          {phoneError ? <Text style={styles.inlineError}>{phoneError}</Text> : null}
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

        {/* Security */}
        {!isOAuthUser(user) && (
          <>
            <Text style={styles.sectionHeader}>Security</Text>
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleChangePasswordPress}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color={colors.primaryBlue} />
                ) : (
                  <Text style={styles.actionRowText}>Change password</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Account Actions */}
        <Text style={styles.sectionHeader}>Account Actions</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleDeactivate}
            disabled={deactivating}
          >
            {deactivating ? (
              <ActivityIndicator size="small" color={colors.primaryBlue} />
            ) : (
              <Text style={styles.actionRowText}>Deactivate account</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleDeletePress}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#C53030" />
            ) : (
              <Text style={[styles.actionRowText, styles.actionRowTextDanger]}>Delete account</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete account confirmation modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleDeleteModalClose}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleDeleteModalClose}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalMessage}>
              This permanently deletes your account and all data. This cannot be undone.
            </Text>
            {isOAuthUser(user) ? (
              <Text style={styles.modalHint}>Type DELETE to confirm</Text>
            ) : (
              <Text style={styles.modalHint}>Enter your password to confirm</Text>
            )}
            <TextInput
              style={styles.modalInput}
              value={deleteInputValue}
              onChangeText={setDeleteInputValue}
              placeholder={isOAuthUser(user) ? 'DELETE' : 'Password'}
              placeholderTextColor={colors.brownText}
              secureTextEntry={!isOAuthUser(user)}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleting}
            />
            {deleteError ? (
              <Text style={styles.modalError}>{deleteError}</Text>
            ) : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={handleDeleteModalClose}
                disabled={deleting}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalButtonDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Change password modal */}
      <Modal
        visible={changePasswordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleChangePasswordClose}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleChangePasswordClose}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Change password</Text>
              <Text style={styles.modalMessage}>
                Enter your current password and choose a new one. Use at least 8 characters with uppercase, lowercase, number, and special character.
              </Text>
              <Text style={styles.modalHint}>Current password</Text>
              <TextInput
                style={[styles.modalInput, changePasswordCurrentError ? styles.modalInputError : null]}
                value={changePasswordCurrent}
                onChangeText={(v) => {
                  setChangePasswordCurrent(v);
                  if (changePasswordCurrentError) setChangePasswordCurrentError('');
                }}
                onBlur={() => {
                  setChangePasswordCurrentError(changePasswordCurrent.trim() ? '' : 'Current password is required');
                }}
                placeholder="Current password"
                placeholderTextColor={colors.brownText}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!changingPassword}
                accessibilityLabel="Current password"
                accessibilityHint="Required to verify your identity before changing"
              />
              <Text style={styles.modalHint}>New password</Text>
              <TextInput
                style={styles.modalInput}
                value={changePasswordNew}
                onChangeText={setChangePasswordNew}
                placeholder="New password"
                placeholderTextColor={colors.brownText}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!changingPassword}
                accessibilityLabel="New password"
                accessibilityHint="At least 8 characters with uppercase, lowercase, and a number"
              />
              <View style={styles.passwordChecklist}>
                {PASSWORD_REQUIREMENTS.map((req) => {
                  const met = req.check(changePasswordNew);
                  return (
                    <Text
                      key={req.key}
                      style={[styles.checklistItem, met ? styles.checklistMet : styles.checklistUnmet]}
                    >
                      {met ? '✓' : '○'} {req.label}
                    </Text>
                  );
                })}
              </View>
              <Text style={styles.modalHint}>Confirm new password</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  confirmPasswordTouched &&
                    changePasswordConfirm.length > 0 &&
                    changePasswordNew !== changePasswordConfirm &&
                    styles.modalInputError,
                ]}
                value={changePasswordConfirm}
                onChangeText={(v) => {
                  setChangePasswordConfirm(v);
                  setConfirmPasswordTouched(true);
                }}
                placeholder="Confirm new password"
                placeholderTextColor={colors.brownText}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!changingPassword}
                accessibilityLabel="Confirm new password"
                accessibilityHint="Must match new password"
              />
              {changePasswordCurrentError ? (
                <Text style={styles.modalError}>{changePasswordCurrentError}</Text>
              ) : null}
              {confirmPasswordTouched && changePasswordConfirm.length > 0 && (
                <Text style={changePasswordNew === changePasswordConfirm ? styles.modalSuccess : styles.modalError}>
                  {changePasswordNew === changePasswordConfirm ? '✓ Passwords match' : '✗ Passwords don\'t match'}
                </Text>
              )}
              {changePasswordError ? (
                <Text style={styles.modalError} accessibilityLiveRegion="polite">
                  {changePasswordError}
                </Text>
              ) : null}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={handleChangePasswordClose}
                  disabled={changingPassword}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonUpdate, !isChangePasswordValid && styles.modalButtonDisabled]}
                  onPress={handleChangePasswordSubmit}
                  disabled={changingPassword || !isChangePasswordValid}
                >
                  {changingPassword ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.modalButtonUpdateText}>Update</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  backButton: {
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
  inputWrapperError: {
    borderColor: ERROR_RED,
  },
  inlineError: {
    fontFamily: typography.body,
    fontSize: 12,
    color: ERROR_RED,
    marginTop: 4,
    marginLeft: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.creamBackground,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontFamily: typography.heroTitle,
    fontSize: 20,
    fontWeight: '600',
    color: colors.brownText,
    marginBottom: 12,
  },
  modalMessage: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    marginBottom: 16,
    lineHeight: 22,
  },
  modalHint: {
    fontFamily: typography.label,
    fontSize: 14,
    color: colors.brownText,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 8,
  },
  modalInputError: {
    borderColor: ERROR_RED,
  },
  passwordChecklist: {
    marginBottom: 12,
    marginLeft: 4,
  },
  checklistItem: {
    fontSize: 12,
    fontFamily: typography.body,
    marginBottom: 4,
  },
  checklistMet: {
    color: SUCCESS_GREEN,
  },
  checklistUnmet: {
    color: colors.brownText,
    opacity: 0.6,
  },
  modalSuccess: {
    fontFamily: typography.body,
    fontSize: 14,
    color: SUCCESS_GREEN,
    marginBottom: 12,
  },
  modalError: {
    fontFamily: typography.body,
    fontSize: 14,
    color: '#C53030',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalButtonCancel: {
    backgroundColor: colors.creamBackground,
  },
  modalButtonCancelText: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.brownText,
    fontWeight: '600',
  },
  modalButtonDelete: {
    backgroundColor: '#C53030',
  },
  modalButtonDeleteText: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.white,
    fontWeight: '600',
  },
  modalButtonUpdate: {
    backgroundColor: colors.primaryBlue,
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalButtonUpdateText: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.white,
    fontWeight: '600',
  },
});
