import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { colors, typography } from '../../../config/theme';
import { updateReadingProgress } from '../../../services/books';

type ReadingProgressSliderProps = {
  userId: string;
  bookId: string;
  initialProgress: number;
  onProgressChange?: (progress: number) => void;
  disabled?: boolean;
};

const MILESTONES = [0, 25, 50, 75, 100];

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function sanitizeInput(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, 3);
}

export default function ReadingProgressSlider({
  userId,
  bookId,
  initialProgress,
  onProgressChange,
  disabled = false,
}: ReadingProgressSliderProps) {
  const [displayProgress, setDisplayProgress] = useState(clampProgress(initialProgress));
  const [inputValue, setInputValue] = useState(String(clampProgress(initialProgress)));
  const [pendingProgress, setPendingProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef(clampProgress(initialProgress));
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const normalized = clampProgress(initialProgress);
    lastSavedRef.current = normalized;
    setDisplayProgress(normalized);
    setInputValue(String(normalized));
  }, [initialProgress]);

  useEffect(() => {
    if (pendingProgress === null || pendingProgress === lastSavedRef.current) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateReadingProgress(userId, bookId, pendingProgress, true);
        lastSavedRef.current = pendingProgress;
        onProgressChange?.(pendingProgress);
      } catch (error) {
        console.error('Error saving reading progress:', error);
      } finally {
        setSaving(false);
        setPendingProgress(null);
      }
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [pendingProgress, userId, bookId, onProgressChange]);

  const handleInputChange = (text: string) => {
    if (disabled) return;
    const sanitized = sanitizeInput(text);
    setInputValue(sanitized);
    if (sanitized.length === 0) {
      setDisplayProgress(0);
      setPendingProgress(null);
      return;
    }
    const numeric = clampProgress(Number(sanitized));
    setDisplayProgress(numeric);
    setPendingProgress(numeric);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Text style={styles.inputLabel}>Percent read:</Text>
        <View style={styles.inputRight}>
          <View style={[styles.inputWrapper, disabled && styles.inputDisabled]}>
            <TextInput
              value={inputValue}
              onChangeText={handleInputChange}
              onBlur={() => {
                const fallback = clampProgress(lastSavedRef.current);
                if (inputValue.length === 0) {
                  setInputValue(String(fallback));
                  setDisplayProgress(fallback);
                  return;
                }
                const clamped = clampProgress(Number(inputValue));
                setInputValue(String(clamped));
                setDisplayProgress(clamped);
                setPendingProgress(clamped);
              }}
              editable={!disabled}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="1-100"
              placeholderTextColor="#9B9B9B"
              style={styles.input}
            />
            <Text style={styles.inputSuffix}>%</Text>
          </View>
          {saving && <Text style={styles.savingText}>saving...</Text>}
        </View>
      </View>

      <View style={[styles.trackContainer, disabled && styles.trackDisabled]}>
        <View style={styles.track} />
        <View
          style={[
            styles.progressFill,
            { width: `${clampProgress(displayProgress)}%` },
          ]}
        />
        {MILESTONES.map((milestone) => (
          <View
            key={milestone}
            style={[
              styles.milestone,
              { left: `${milestone}%` },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  savingText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 12,
    gap: 6,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  inputRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.white,
    minWidth: 60,
    justifyContent: 'flex-start',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  input: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    padding: 0,
    textAlign: 'left',
    minWidth: 28,
  },
  inputSuffix: {
    marginLeft: 6,
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  trackContainer: {
    height: 36,
    justifyContent: 'center',
  },
  trackDisabled: {
    opacity: 0.6,
  },
  track: {
    height: 6,
    borderRadius: 6,
    backgroundColor: '#E2E2E2',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 6,
    backgroundColor: colors.primaryBlue,
  },
  milestone: {
    position: 'absolute',
    width: 2,
    height: 10,
    top: 13,
    marginLeft: -1,
    backgroundColor: '#C8C8C8',
  },
});
