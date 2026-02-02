import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { colors, typography } from '../../../config/theme';

type ProfileShelfCardProps = {
  iconSource: ImageSourcePropType;
  title: string;
  count: number;
  onPress?: () => void;
  disabled?: boolean;
};

type ProfileStatCardProps = {
  iconSource: ImageSourcePropType;
  label: string;
  value: string;
};

export function ProfileShelfCard({
  iconSource,
  title,
  count,
  onPress,
  disabled,
}: ProfileShelfCardProps) {
  return (
    <TouchableOpacity
      style={styles.shelfCard}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <Image source={iconSource} style={styles.shelfCardIcon} resizeMode="contain" />
      <Text style={styles.shelfCardTitle}>{title}</Text>
      <Text style={styles.shelfCardCount}>{count}</Text>
    </TouchableOpacity>
  );
}

export function ProfileStatCard({ iconSource, label, value }: ProfileStatCardProps) {
  return (
    <View style={styles.statCard}>
      <Image source={iconSource} style={styles.statIcon} resizeMode="contain" />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shelfCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shelfCardIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    tintColor: colors.brownText,
  },
  shelfCardTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  shelfCardCount: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statIcon: {
    width: 32,
    height: 32,
    marginBottom: 8,
    tintColor: colors.brownText,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    textAlign: 'center',
  },
});
