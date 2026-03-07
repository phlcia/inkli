import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { colors, typography } from '../../../config/theme';
import { reportContent, type ReportReason, type ReportTargetType } from '../../../services/moderation';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'underage_user', label: 'Underage user' },
  { value: 'other', label: 'Other' },
];

export interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  onSuccess?: () => void;
}

export default function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  onSuccess,
}: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const prevVisibleRef = useRef(visible);

  useEffect(() => {
    const justOpened = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (justOpened) {
      setReason(null);
      setDetails('');
    }
    if (visible) {
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, anim]);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const result = await reportContent({
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details.trim() || undefined,
      });
      if (result.error && !result.already_reported) {
        throw result.error;
      }
      onSuccess?.();
      onClose();
      if (result.already_reported) {
        Alert.alert('Already reported', "You've already reported this.");
      } else {
        Alert.alert('Thanks!', "We'll review this.");
      }
    } catch (err) {
      console.error('Report submit error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setReason(null);
      setDetails('');
      onClose();
    }
  };

  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 34 : 0}
          style={styles.keyboardAvoid}
        >
          <Animated.View
            style={[
              styles.panel,
              {
                opacity,
                transform: [{ scale }],
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Report</Text>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
                disabled={submitting}
              >
                <Text style={styles.closeButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.question}>Why are you reporting this?</Text>

              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.option, reason === r.value && styles.optionSelected]}
                  onPress={() => setReason(r.value)}
                  activeOpacity={0.7}
                  disabled={submitting}
                >
                  <View style={[styles.radio, reason === r.value && styles.radioSelected]} />
                  <Text style={styles.optionLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.detailsLabel}>Additional details</Text>
              <TextInput
                style={styles.detailsInput}
                value={details}
                onChangeText={setDetails}
                placeholder="Add any context that might help our team"
                placeholderTextColor={`${colors.brownText}99`}
                multiline
                numberOfLines={3}
                editable={!submitting}
              />

              <TouchableOpacity
                style={[styles.submitButton, (!reason || submitting) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!reason || submitting}
                activeOpacity={0.7}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardAvoid: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  panel: {
    backgroundColor: colors.creamBackground,
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    minHeight: 300,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.brownText + '20',
  },
  title: {
    fontSize: 24,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  scroll: {
    maxHeight: 400,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  question: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  optionSelected: {
    backgroundColor: `${colors.primaryBlue}15`,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.brownText,
    marginRight: 12,
  },
  radioSelected: {
    borderColor: colors.primaryBlue,
    backgroundColor: colors.primaryBlue,
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  detailsLabel: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginTop: 16,
    marginBottom: 8,
  },
  detailsInput: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.primaryBlue,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
});
