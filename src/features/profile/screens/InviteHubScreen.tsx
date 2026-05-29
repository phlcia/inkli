import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, typography } from '../../../config/theme';
import { useInviteTier } from '../../../hooks/useInviteTier';
import {
  type FeatureKey,
  spendInvitePoint,
  FEATURE_KEYS,
} from '../../../services/invites';

const FEATURE_LABELS: Record<FeatureKey, string> = {
  community_scores: 'Community average scores on book detail',
  activity_feed: 'Home activity feed',
  friend_recommendations: 'From your friends',
  friends_rankings: "Friends' rankings for books",
  leaderboard_circles: 'Leaderboard & book circles',
};

export default function InviteHubScreen() {
  const navigation = useNavigation();
  const {
    sentCount,
    inviteCount,
    unspentPoints,
    isWallCleared,
    hasFeature,
    availableToUnlock,
    loading,
  } = useInviteTier();

  const [spendingKey, setSpendingKey] = useState<FeatureKey | null>(null);

  const handleUnlock = async (featureKey: FeatureKey) => {
    if (!isWallCleared || unspentPoints < 1 || hasFeature(featureKey)) return;
    setSpendingKey(featureKey);
    const { error } = await spendInvitePoint(featureKey);
    setSpendingKey(null);
    if (error) {
      Alert.alert('Couldn’t unlock', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Hub</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => navigation.navigate('InviteContactsPicker' as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.shareButtonText}>Invite from contacts</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sentCount}/4</Text>
            <Text style={styles.statLabel}>invites sent</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{inviteCount}</Text>
            <Text style={styles.statLabel}>friends joined</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{unspentPoints}</Text>
            <Text style={styles.statLabel}>unlock points</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Unlock features</Text>
          {FEATURE_KEYS.map((key) => {
            const unlocked = hasFeature(key);
            const canUnlock =
              isWallCleared && unspentPoints > 0 && !unlocked;
            const isSpending = spendingKey === key;

            return (
              <View key={key} style={styles.featureCard}>
                <View style={styles.featureTextRow}>
                  <Text
                    style={[
                      styles.featureTitle,
                      unlocked && styles.featureTitleUnlocked,
                    ]}
                  >
                    {FEATURE_LABELS[key]}
                  </Text>
                  {unlocked && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                {!unlocked && canUnlock && (
                  <TouchableOpacity
                    style={styles.unlockButton}
                    onPress={() => handleUnlock(key)}
                    disabled={isSpending}
                    activeOpacity={0.8}
                  >
                    {isSpending ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.unlockButtonText}>Unlock (1 point)</Text>
                    )}
                  </TouchableOpacity>
                )}
                {!unlocked && !canUnlock && (
                  <Text style={styles.featureHint}>
                    {!isWallCleared
                      ? 'Send 4 invites to start unlocking'
                      : unspentPoints < 1
                        ? 'Earn more points when friends join'
                        : ''}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.comingSoonRow}>
          <Text style={styles.comingSoonText}>
            More features coming soon — keep inviting!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    marginTop: Platform.OS === 'ios' ? 8 : 16,
    marginLeft: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.brownText,
    fontWeight: 'bold',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 32,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: typography.button,
    fontSize: 14,
    color: colors.brownText,
    opacity: 0.8,
    marginBottom: 10,
  },
  shareButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.white,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: typography.button,
    fontSize: 18,
    color: colors.primaryBlue,
    marginBottom: 2,
  },
  statLabel: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.brownText,
    opacity: 0.8,
  },
  featureCard: {
    backgroundColor: colors.white,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  featureTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureTitle: {
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.brownText,
    flex: 1,
  },
  featureTitleUnlocked: {
    opacity: 0.9,
  },
  checkmark: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.primaryBlue,
    marginLeft: 8,
  },
  unlockButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryBlue,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  unlockButtonText: {
    fontFamily: typography.button,
    fontSize: 14,
    color: colors.white,
  },
  featureHint: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.brownText,
    opacity: 0.7,
    marginTop: 6,
  },
  comingSoonRow: {
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  comingSoonText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    opacity: 0.6,
  },
});
