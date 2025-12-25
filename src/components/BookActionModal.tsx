import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { colors, typography } from '../config/theme';
import { UserBook } from '../services/books';

interface BookActionModalProps {
  visible: boolean;
  book: UserBook | null;
  onClose: () => void;
  onMoveToRead: () => void;
  onMoveToCurrentlyReading: () => void;
  onMoveToWantToRead: () => void;
  onRemove: () => void;
}

export default function BookActionModal({
  visible,
  book,
  onClose,
  onMoveToRead,
  onMoveToCurrentlyReading,
  onMoveToWantToRead,
  onRemove,
}: BookActionModalProps) {
  if (!book) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.bookTitle}>{book.book?.title || 'Unknown'}</Text>
            <Text style={styles.bookAuthor}>
              {book.book?.authors?.join(', ') || 'Unknown Author'}
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.option}
              onPress={() => {
                onMoveToRead();
                onClose();
              }}
            >
              <Text style={styles.optionText}>Move to Read</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              onPress={() => {
                onMoveToCurrentlyReading();
                onClose();
              }}
            >
              <Text style={styles.optionText}>Move to Currently Reading</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              onPress={() => {
                onMoveToWantToRead();
                onClose();
              }}
            >
              <Text style={styles.optionText}>Move to Want to Read</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, styles.removeOption]}
              onPress={() => {
                onRemove();
                onClose();
              }}
            >
              <Text style={styles.removeOptionText}>Remove from Shelf</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.creamBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.brownText,
    opacity: 0.2,
  },
  bookTitle: {
    fontSize: 18,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  optionsContainer: {
    marginBottom: 16,
  },
  option: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  optionText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  removeOption: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.brownText,
    marginTop: 8,
  },
  removeOptionText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.primaryBlue,
  },
  cancelButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
});
