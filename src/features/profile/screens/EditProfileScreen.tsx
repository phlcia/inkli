import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getUserProfile,
  saveProfileWithPicture,
  getProfilePictureUrl,
  checkUsernameAvailability,
} from '../../../services/userProfile';
import {
  MAX_USERNAME_LENGTH,
  USERNAME_REGEX,
  DEBOUNCE_MS,
  ERROR_RED,
  SUCCESS_GREEN,
} from '../../../utils/validation';
import ProfilePhotoActionSheet from '../components/ProfilePhotoActionSheet';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';

type EditProfileScreenNavigationProp = StackNavigationProp<
  ProfileStackParamList,
  'EditProfile'
>;

export default function EditProfileScreen() {
  const navigation = useNavigation<EditProfileScreenNavigationProp>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [tempPhotoUri, setTempPhotoUri] = useState<string | null>(null);
  const [deleteProfilePicture, setDeleteProfilePicture] = useState(false);

  // Original values for comparison
  const [originalUsername, setOriginalUsername] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [originalBio, setOriginalBio] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameFormatError, setUsernameFormatError] = useState('');
  const [usernameRequiredError, setUsernameRequiredError] = useState('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const usernameRef = useRef(username);

  usernameRef.current = username;

  const loadProfileData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { profile, error } = await getUserProfile(user.id);

      if (error) {
        Alert.alert('Error', 'Failed to load profile data');
        setLoading(false);
        return;
      }

      if (profile) {
        const n = profile.name || '';
        const u = profile.username || '';
        const b = profile.bio || '';
        setName(n);
        setUsername(u);
        setOriginalUsername(u);
        setOriginalName(n);
        setOriginalBio(b);
        setBio(b);
        setUsernameStatus('available');
        setUsernameFormatError('');
        setUsernameRequiredError('');
        setProfilePhotoUrl(profile.profile_photo_url);
      } else {
        setName('');
        setUsername('');
        setOriginalUsername('');
        setOriginalName('');
        setOriginalBio('');
        setBio('');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const handleChooseFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setTempPhotoUri(result.assets[0].uri);
        setDeleteProfilePicture(false); // Clear delete flag when selecting new image
        setShowActionSheet(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setTempPhotoUri(result.assets[0].uri);
        setDeleteProfilePicture(false); // Clear delete flag when selecting new image
        setShowActionSheet(false);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleDeletePhoto = () => {
    // Set delete flag - actual deletion happens on save
    setDeleteProfilePicture(true);
    setTempPhotoUri(null); // Clear any new image selection
    setShowActionSheet(false);
  };

  const runUsernameCheck = useCallback(async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > MAX_USERNAME_LENGTH || !USERNAME_REGEX.test(value)) return;
    if (trimmed === originalUsername.toLowerCase()) {
      setUsernameStatus('available');
      return;
    }
    setUsernameStatus('checking');
    const valueToCheck = trimmed;
    const { available, error } = await checkUsernameAvailability(valueToCheck);
    if (valueToCheck !== usernameRef.current.trim().toLowerCase()) return;
    if (error) {
      setUsernameStatus('error');
      return;
    }
    setUsernameStatus(available ? 'available' : 'taken');
  }, [originalUsername]);

  const scheduleUsernameCheck = useCallback(
    (value: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const trimmed = value.trim().toLowerCase();
      if (trimmed === originalUsername.toLowerCase()) {
        setUsernameStatus('available');
        setUsernameFormatError('');
        return;
      }
      if (trimmed.length < 3) {
        setUsernameStatus('idle');
        setUsernameFormatError(trimmed.length > 0 ? 'Username must be at least 3 characters' : '');
        return;
      }
      if (trimmed.length > MAX_USERNAME_LENGTH) {
        setUsernameStatus('idle');
        setUsernameFormatError(`Username must be ${MAX_USERNAME_LENGTH} characters or less`);
        return;
      }
      if (!USERNAME_REGEX.test(value)) {
        setUsernameStatus('idle');
        setUsernameFormatError('Username must start with a letter and contain only letters, numbers, and underscores');
        return;
      }
      setUsernameFormatError('');
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void runUsernameCheck(value);
      }, DEBOUNCE_MS);
    },
    [originalUsername, runUsernameCheck]
  );

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (usernameRequiredError) setUsernameRequiredError('');
    const trimmed = value.trim().toLowerCase();
    if (trimmed === originalUsername.toLowerCase()) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setUsernameStatus('available');
      setUsernameFormatError('');
      return;
    }
    if (trimmed.length < 3) {
      setUsernameStatus('idle');
      setUsernameFormatError(value.length > 0 ? 'Username must be at least 3 characters' : '');
      return;
    }
    if (!USERNAME_REGEX.test(value)) {
      setUsernameStatus('idle');
      setUsernameFormatError('Username must start with a letter and contain only letters, numbers, and underscores');
      return;
    }
    setUsernameFormatError('');
    scheduleUsernameCheck(value);
  };

  const handleUsernameBlur = () => {
    if (!username.trim()) {
      setUsernameRequiredError('Username is required');
      return;
    }
    setUsernameRequiredError('');
    if (username.trim().length >= 3 && USERNAME_REGEX.test(username)) {
      if (username.trim().toLowerCase() === originalUsername.toLowerCase()) {
        setUsernameStatus('available');
        return;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void runUsernameCheck(username);
    }
  };

  const handleRetryUsernameCheck = () => {
    if (usernameStatus === 'error' && username.trim().length >= 3 && USERNAME_REGEX.test(username)) {
      void runUsernameCheck(username);
    }
  };

  const isUsernameValid =
    username.trim().length >= 3 &&
    username.length <= MAX_USERNAME_LENGTH &&
    USERNAME_REGEX.test(username) &&
    (usernameStatus === 'available' || username.trim().toLowerCase() === originalUsername.toLowerCase());

  const hasChanges =
    name.trim() !== originalName ||
    username.trim().toLowerCase() !== originalUsername.toLowerCase() ||
    (bio.trim() || '') !== (originalBio || '') ||
    tempPhotoUri !== null ||
    deleteProfilePicture;

  const isFormValid = name.trim().length > 0 && !usernameRequiredError && isUsernameValid;

  const handleCancel = () => {
    // Reset all photo-related state
    setTempPhotoUri(null);
    setDeleteProfilePicture(false);
    // Navigate back to ProfileScreen
    navigation.goBack();
  };

  const handleSave = async () => {
    if (!user || !isFormValid || !hasChanges) return;

    try {
      setSaving(true);

      // Use the new saveProfileWithPicture function that handles all scenarios
      const { profile, error } = await saveProfileWithPicture(
        user.id,
        {
          name: name.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim() || null,
        },
        tempPhotoUri, // null if no new image selected
        deleteProfilePicture // true if user wants to delete
      );

      if (error) {
        // Show user-friendly error messages
        let errorMessage = 'Failed to update profile';
        if (error.message) {
          if (error.message.includes('too large')) {
            errorMessage = 'Image file is too large. Maximum size is 5MB.';
          } else if (error.message.includes('Unsupported')) {
            errorMessage = 'Unsupported image format. Please use JPG, PNG, or WEBP.';
          } else if (error.message.includes('not authenticated')) {
            errorMessage = 'Authentication error. Please try again.';
          } else if (error.code === '23505') {
            errorMessage = 'Username is already taken';
          } else {
            errorMessage = error.message;
          }
        }
        Alert.alert('Error', errorMessage);
        setSaving(false);
        return;
      }

      // Reset photo-related state after successful save
      setTempPhotoUri(null);
      setDeleteProfilePicture(false);
      if (profile) {
        setProfilePhotoUrl(profile.profile_photo_url);
      }

      Alert.alert('Success', 'Profile updated successfully', [
        {
          text: 'OK',
          onPress: () => {
            // Pass refresh param to trigger profile reload
            navigation.goBack();
            // Trigger refresh on ProfileScreen
            setTimeout(() => {
              (navigation as any).navigate('ProfileMain', { refresh: true });
            }, 100);
          },
        },
      ]);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile');
      setSaving(false);
    }
  };

  const getInitial = () => {
    if (name) {
      return name.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email?.charAt(0).toUpperCase() ?? 'U';
    }
    return 'U';
  };

  // Determine what to display: preview, current photo, or placeholder
  const displayPhotoUri = deleteProfilePicture 
    ? null 
    : (tempPhotoUri || (profilePhotoUrl ? getProfilePictureUrl(profilePhotoUrl) : null));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !isFormValid || !hasChanges}>
          <Text style={[styles.saveButton, (saving || !isFormValid || !hasChanges) && styles.saveButtonDisabled]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Profile Photo Section */}
        <View style={styles.profilePhotoSection}>
          <TouchableOpacity
            onPress={() => setShowActionSheet(true)}
            activeOpacity={0.7}
          >
            {displayPhotoUri ? (
              <Image
                source={{ uri: displayPhotoUri }}
                style={styles.profilePhoto}
              />
            ) : (
              <View style={styles.profilePhotoPlaceholder}>
                <Text style={styles.profilePhotoText}>{getInitial()}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowActionSheet(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.formSection}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Name</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={colors.brownText}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <View style={[
              styles.inputWrapper,
              (usernameRequiredError || usernameFormatError || usernameStatus === 'taken' || usernameStatus === 'error') && styles.inputWrapperError,
            ]}>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={handleUsernameChange}
                onBlur={handleUsernameBlur}
                placeholder="Enter username"
                placeholderTextColor={colors.brownText}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={MAX_USERNAME_LENGTH}
              />
              {usernameStatus === 'checking' && (
                <ActivityIndicator size="small" color={colors.primaryBlue} style={styles.usernameSpinner} />
              )}
            </View>
            {usernameRequiredError ? (
              <Text style={styles.inlineError}>{usernameRequiredError}</Text>
            ) : usernameFormatError ? (
              <Text style={styles.inlineError}>{usernameFormatError}</Text>
            ) : usernameStatus === 'available' ? (
              <Text style={styles.inlineSuccess}>✓ Username available</Text>
            ) : usernameStatus === 'taken' ? (
              <Text style={styles.inlineError}>✗ Username taken</Text>
            ) : usernameStatus === 'error' ? (
              <TouchableOpacity onPress={handleRetryUsernameCheck}>
                <Text style={[styles.inlineError, styles.retryText]}>Unable to check availability. Try again.</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Bio</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="Add a bio"
                placeholderTextColor={colors.brownText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.accountPrivacyButton}
            onPress={() => navigation.navigate('AccountSettings')}
          >
            <Text style={styles.accountPrivacyButtonText}>Account & privacy</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>

      {/* Profile Photo Action Sheet */}
      <ProfilePhotoActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        onChooseFromLibrary={handleChooseFromLibrary}
        onTakePhoto={handleTakePhoto}
        onDeletePhoto={handleDeletePhoto}
      />
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
  saveButton: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  profilePhotoSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  profilePhotoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  profilePhotoText: {
    fontSize: 48,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  editProfileText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '500',
  },
  formSection: {
    paddingHorizontal: 24,
  },
  inputContainer: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: typography.label,
    color: colors.brownText,
    marginBottom: 8,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brownText,
    paddingHorizontal: 18,
    position: 'relative',
  },
  inputWrapperError: {
    borderColor: ERROR_RED,
  },
  usernameSpinner: {
    position: 'absolute',
    right: 16,
  },
  inlineError: {
    fontSize: 12,
    fontFamily: typography.body,
    color: ERROR_RED,
    marginTop: 4,
    marginLeft: 4,
  },
  inlineSuccess: {
    fontSize: 12,
    fontFamily: typography.body,
    color: SUCCESS_GREEN,
    marginTop: 4,
    marginLeft: 4,
  },
  retryText: {
    textDecorationLine: 'underline',
  },
  accountPrivacyButton: {
    marginTop: 24,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brownText,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  accountPrivacyButtonText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    height: 50,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    paddingVertical: 0,
  },
  bioInput: {
    height: 100,
    paddingTop: 12,
    paddingBottom: 12,
  },
});
