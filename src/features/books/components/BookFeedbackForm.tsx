import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { colors, typography } from '../../../config/theme';
import { submitBookFeedback } from '../../../services/bookFeedback';

const ISSUE_TYPES: { value: string; label: string }[] = [
  { value: 'incorrect_author', label: 'Incorrect author' },
  { value: 'incorrect_title', label: 'Incorrect title' },
  { value: 'incorrect_description', label: 'Incorrect description' },
  { value: 'incorrect_cover_image', label: 'Incorrect cover image' },
  { value: 'incorrect_metadata', label: 'Incorrect metadata' },
  { value: 'other', label: 'Other' },
];

interface BookFeedbackFormProps {
  visible: boolean;
  onClose: () => void;
  bookId: string;
  bookTitle?: string;
}

export default function BookFeedbackForm({
  visible,
  onClose,
  bookId,
  bookTitle: _bookTitle,
}: BookFeedbackFormProps) {
  const [issueType, setIssueType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setIssueType('');
      setDescription('');
      setError(null);
      setSubmitted(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!issueType) {
      setError('Please select an issue type');
      return;
    }

    if (!bookId) {
      setError('Unable to identify this book');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { success: ok, error: err } = await submitBookFeedback({
      bookId,
      issueType,
      description: description.trim() || undefined,
    });

    setSubmitting(false);

    if (ok) {
      setSubmitted(true);
      setTimeout(() => onClose(), 1200);
    } else {
      const message = err?.message || 'Failed to submit feedback';
      setError(message.includes('Unauthorized') ? 'You must be logged in to report incorrect information' : message);
    }
  };

  const handleCancel = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleCancel}
        />
        <View style={styles.sheet}>
          <KeyboardAwareScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={16}
            extraHeight={0}
            enableResetScrollToCoords={false}
          >
              <Text style={styles.title}>Report incorrect information</Text>

              <Text style={styles.label}>Issue type</Text>
                  <ScrollView style={styles.issueTypeList} nestedScrollEnabled>
                    {ISSUE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[styles.issueTypeOption, issueType === type.value && styles.issueTypeOptionSelected]}
                        onPress={() => setIssueType(type.value)}
                        activeOpacity={0.7}
                        disabled={submitting}
                      >
                        <Text style={[styles.issueTypeText, issueType === type.value && styles.issueTypeTextSelected]}>
                          {issueType === type.value ? '✓ ' : ''}{type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={styles.label}>Additional details (optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Add details..."
                    placeholderTextColor={colors.brownText + '60'}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                    editable={!submitting}
                  />

                  {error && (
                    <Text style={styles.errorText}>{error}</Text>
                  )}

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.button, styles.submitButton, submitted && styles.submitButtonSuccess]}
                      onPress={handleSubmit}
                      disabled={submitting || submitted}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.submitButtonText}>
                        {submitted ? 'Submitted!' : submitting ? 'Submitting...' : 'Submit'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={handleCancel}
                      disabled={submitting}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: colors.creamBackground,
    borderRadius: 20,
    marginHorizontal: 24,
    maxWidth: 400,
    maxHeight: '90%',
    alignSelf: 'center',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 8,
  },
  issueTypeList: {
    maxHeight: 180,
    marginBottom: 16,
  },
  issueTypeOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.brownText + '20',
  },
  issueTypeOptionSelected: {
    borderColor: colors.primaryBlue,
    backgroundColor: colors.primaryBlue + '15',
  },
  issueTypeText: {
    fontSize: 15,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  issueTypeTextSelected: {
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  textInput: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brownText + '20',
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: '#D24B4B',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    backgroundColor: colors.primaryBlue,
  },
  submitButtonSuccess: {
    backgroundColor: '#2FA463',
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brownText + '20',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
});
