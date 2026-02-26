import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography } from '../config/theme';
import type { FeatureKey } from '../services/invites';

interface FeatureTeaserProps {
  featureKey: FeatureKey;
  onPress: () => void;
  loading: boolean;
}

export function FeatureTeaser({ featureKey, onPress, loading }: FeatureTeaserProps) {
  if (loading) {
    return (
      <View style={styles.skeleton}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.title}>Invite your friends!</Text>
      <Text style={styles.subtitle}>Tap to invite and unlock more features...</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.creamBackground,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: colors.brownText,
    opacity: 0.15,
    borderRadius: 4,
    marginBottom: 8,
    width: '80%',
  },
  skeletonLineShort: {
    width: '50%',
  },
  card: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primaryBlue,
    borderStyle: 'dashed',
  },
  title: {
    fontFamily: typography.button,
    fontSize: 15,
    color: colors.primaryBlue,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.brownText,
    opacity: 0.8,
  },
});
