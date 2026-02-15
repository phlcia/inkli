import React, { useState, useEffect, useCallback } from 'react';
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
import ProfilePhotoActionSheet from '../components/ProfilePhotoActionSheet';
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
        const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        setName(fullName || '');
        setUsername(profile.username || '');
        setOriginalUsername(profile.username || '');
        setBio(profile.bio || '');
        setProfilePhotoUrl(profile.profile_photo_url);
      } else {
        setName('');
        setUsername('');
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

  const handleCancel = () => {
    // Reset all photo-related state
    setTempPhotoUri(null);
    setDeleteProfilePicture(false);
    // Navigate back to ProfileScreen
    navigation.goBack();
  };

  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    // Check username availability if changed
    if (username.toLowerCase() !== originalUsername.toLowerCase()) {
      const { available, error: checkError } = await checkUsernameAvailability(
        username
      );

      if (checkError) {
        Alert.alert('Error', 'Failed to check username availability');
        return;
      }

      if (!available) {
        Alert.alert('Error', 'Username is already taken');
        return;
      }
    }

    try {
      setSaving(true);

      // Split name into first and last
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Use the new saveProfileWithPicture function that handles all scenarios
      const { profile, error } = await saveProfileWithPicture(
        user.id,
        {
          firstName,
          lastName,
          username: username.trim(),
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
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
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
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Enter username"
                placeholderTextColor={colors.brownText}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
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
