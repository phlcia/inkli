import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../../../config/theme';
import { useInviteTier } from '../../../hooks/useInviteTier';
import {
  shareInviteLink,
  getPendingInviteCode,
  acceptInvite,
  clearPendingInviteCode,
} from '../../../services/invites';

interface InviteGateScreenProps {
  onInviteGateCleared?: () => void;
}

export default function InviteGateScreen({
  onInviteGateCleared,
}: InviteGateScreenProps) {
  const {
    sentCount,
    inviteCount,
    isWallCleared,
    loading,
  } = useInviteTier();

  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (isWallCleared) {
      onInviteGateCleared?.();
    }
  }, [isWallCleared, onInviteGateCleared]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code = await getPendingInviteCode();
      if (cancelled || !code) return;
      const { error } = await acceptInvite(code);
      await clearPendingInviteCode();
      if (error && !cancelled) {
        console.warn('InviteGateScreen: acceptInvite failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareInviteLink();
    } finally {
      setSharing(false);
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Before you go in...</Text>
        <Text style={styles.subtitle}>
          Send your invite link to 4 friends to unlock the full Inkli experience. When they join,
          you’ll earn unlock points for extra features.
        </Text>

        <View style={styles.progressCard}>
          <Text style={styles.progressMain}>
            {sentCount}/4 invites sent
          </Text>
          <Text style={styles.progressSub}>
            {inviteCount} friend{inviteCount !== 1 ? 's' : ''} joined so far
          </Text>
        </View>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          activeOpacity={0.8}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.shareButtonText}>Share invite link</Text>
          )}
        </TouchableOpacity>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  title: {
    fontFamily: typography.heroTitle,
    fontSize: 26,
    color: colors.brownText,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    lineHeight: 24,
    marginBottom: 28,
    textAlign: 'center',
    opacity: 0.9,
  },
  progressCard: {
    backgroundColor: colors.white,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  progressMain: {
    fontFamily: typography.button,
    fontSize: 20,
    color: colors.primaryBlue,
    marginBottom: 4,
  },
  progressSub: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    opacity: 0.8,
  },
  shareButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  shareButtonText: {
    fontFamily: typography.button,
    fontSize: 17,
    color: colors.white,
  },
});
