import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../config/theme';

interface ProfilePhotoActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onChooseFromLibrary: () => void;
  onTakePhoto: () => void;
  onDeletePhoto: () => void;
}

export default function ProfilePhotoActionSheet({
  visible,
  onClose,
  onChooseFromLibrary,
  onTakePhoto,
  onDeletePhoto,
}: ProfilePhotoActionSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.content}>
              <Text style={styles.title}>Edit Profile Photo</Text>
              <Text style={styles.description}>
                Make it easier for your friends to find you on Inkli by adding a profile photo!
              </Text>

              <TouchableOpacity
                style={styles.button}
                onPress={onChooseFromLibrary}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>Choose from library</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={onTakePhoto}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>Take photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={onDeletePhoto}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, styles.deleteButtonText]}>
                  Delete photo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: colors.creamBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brownText,
    marginBottom: 12,
    alignItems: 'center',
  },
  cancelButton: {
    marginTop: 8,
    marginBottom: 0,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.brownText,
    fontWeight: '500',
  },
  deleteButtonText: {
    color: '#FF3B30', // Red color for delete action
  },
});
