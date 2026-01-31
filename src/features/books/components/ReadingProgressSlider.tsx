import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
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

function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export default function ReadingProgressSlider({
  userId,
  bookId,
  initialProgress,
  onProgressChange,
  disabled = false,
}: ReadingProgressSliderProps) {
  const [trackWidth, setTrackWidth] = useState(1);
  const [trackPageX, setTrackPageX] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(clampProgress(initialProgress));
  const [pendingProgress, setPendingProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef(clampProgress(initialProgress));
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const trackRef = useRef<View | null>(null);

  useEffect(() => {
    const normalized = clampProgress(initialProgress);
    lastSavedRef.current = normalized;
    setDisplayProgress(normalized);
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

  const updateFromX = useCallback(
    (x: number, snap: boolean) => {
      const raw = clampProgress((x / trackWidth) * 100);
      const next = snap ? clampProgress(snapToStep(raw, 5)) : raw;
      setDisplayProgress(next);
      if (snap) {
        setPendingProgress(next);
      }
    },
    [trackWidth]
  );

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt) => {
        const localX = evt.nativeEvent.locationX;
        updateFromX(localX, false);
      },
      onPanResponderMove: (_evt, gestureState) => {
        const localX = gestureState.moveX - trackPageX;
        updateFromX(localX, false);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const localX = gestureState.moveX - trackPageX;
        updateFromX(localX, true);
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderTerminate: (_evt, gestureState) => {
        const localX = gestureState.moveX - trackPageX;
        updateFromX(localX, true);
      },
    }),
    [disabled, trackPageX, updateFromX]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.percentText}>Read: {Math.round(displayProgress)}%</Text>
        {saving && <Text style={styles.savingText}>saving...</Text>}
      </View>

      <View
        ref={trackRef}
        style={[styles.trackContainer, disabled && styles.trackDisabled]}
        onLayout={() => {
          trackRef.current?.measure((_x, _y, width, _height, pageX) => {
            setTrackWidth(width || 1);
            setTrackPageX(pageX || 0);
          });
        }}
        {...panResponder.panHandlers}
      >
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
        <View
          style={[
            styles.thumb,
            {
              left: `${clampProgress(displayProgress)}%`,
              transform: [{ translateX: -14 }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  percentText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  savingText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
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
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
