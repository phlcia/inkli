import React, { ReactNode } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, typography } from '../../../config/theme';

type ProfileStats = {
  followers: number;
  following: number;
  rankLabel: string;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
};

type ProfileInfoSectionProps = {
  profilePhotoUrl?: string | null;
  avatarFallback: string;
  displayName: string;
  memberSinceLabel: string;
  bio?: string | null;
  showStats?: boolean;
  stats?: ProfileStats;
  children?: ReactNode;
};

function StatBox({
  value,
  label,
  onPress,
}: {
  value: string | number;
  label: string;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <TouchableOpacity style={styles.statBox} onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.statBoxValue}>{value}</Text>
        <Text style={styles.statBoxLabel}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.statBox}>
      <Text style={styles.statBoxValue}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileInfoSection({
  profilePhotoUrl,
  avatarFallback,
  displayName,
  memberSinceLabel,
  bio,
  showStats = true,
  stats,
  children,
}: ProfileInfoSectionProps) {
  return (
    <View style={styles.profileSection}>
      <View style={styles.avatarContainer}>
        {profilePhotoUrl ? (
          <Image
            source={{ uri: profilePhotoUrl }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarFallback}</Text>
          </View>
        )}
      </View>
      <Text style={styles.username}>{displayName}</Text>
      <Text style={styles.memberSince}>{memberSinceLabel}</Text>
      {bio ? <Text style={styles.bio}>{bio}</Text> : null}

      {showStats && stats ? (
        <View style={styles.statsRow}>
          <StatBox
            value={stats.followers}
            label="Followers"
            onPress={stats.onPressFollowers}
          />
          <StatBox
            value={stats.following}
            label="Following"
            onPress={stats.onPressFollowing}
          />
          <StatBox value={stats.rankLabel} label="Rank" />
        </View>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 40,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  username: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberSince: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.8,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  statBox: {
    alignItems: 'center',
  },
  statBoxValue: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 4,
  },
  statBoxLabel: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
});
