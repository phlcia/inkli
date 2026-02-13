import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, typography } from '../config/theme';

const TOAST_DURATION_MS = 5000;

interface ErrorToastProps {
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function ErrorToast({ message, onRetry, onDismiss }: ErrorToastProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [fadeAnim, onDismiss]);

  const handleRetry = () => {
    onRetry?.();
    onDismiss();
  };

  return (
    <Animated.View
      style={[styles.wrapper, { opacity: fadeAnim }]}
      pointerEvents="box-none"
    >
      <View style={styles.toast}>
        <Text style={styles.message}>{message}</Text>
        {onRetry && (
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
            onPress={handleRetry}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    backgroundColor: colors.brownText,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  message: {
    color: colors.white,
    fontFamily: typography.body,
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: 6,
  },
  retryPressed: {
    opacity: 0.8,
  },
  retryText: {
    color: colors.brownText,
    fontFamily: typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
});
