import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';
import {
  type FeatureKey,
  FEATURE_KEYS,
  fetchInviteProfile,
  fetchUnlockedFeatures,
} from '../services/invites';

const REFETCH_DELAY_MS = 500;

export function useInviteTier() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [inviteCount, setInviteCount] = useState(0);
  const [unspentPoints, setUnspentPoints] = useState(0);
  const [unlockedKeys, setUnlockedKeys] = useState<Set<FeatureKey>>(new Set());
  const [grandfathered, setGrandfathered] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) {
      setInviteCode(null);
      setSentCount(0);
      setInviteCount(0);
      setUnspentPoints(0);
      setUnlockedKeys(new Set());
      setGrandfathered(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profileResult, featuresResult] = await Promise.all([
        fetchInviteProfile(userId),
        fetchUnlockedFeatures(userId),
      ]);
      if (profileResult.data) {
        setInviteCode(profileResult.data.invite_code || null);
        setSentCount(profileResult.data.sent_invites_count);
        setInviteCount(profileResult.data.successful_invites_count);
        setUnspentPoints(profileResult.data.unspent_invite_points);
        setGrandfathered(profileResult.data.grandfathered_invite_unlock);
      }
      if (featuresResult.data) {
        setUnlockedKeys(new Set(featuresResult.data.map((r) => r.feature_key)));
      }
    } catch (error) {
      console.error('useInviteTier refetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!userId) return;

    const delayedRefetch = () => {
      setTimeout(refetch, REFETCH_DELAY_MS);
    };

    const invitesChannel = supabase
      .channel(`user_invites:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_invites',
          filter: `inviter_user_id=eq.${userId}`,
        },
        delayedRefetch
      )
      .subscribe();

    const featuresChannel = supabase
      .channel(`user_unlocked_features:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_unlocked_features',
          filter: `user_id=eq.${userId}`,
        },
        refetch
      )
      .subscribe();

    return () => {
      supabase.removeChannel(invitesChannel);
      supabase.removeChannel(featuresChannel);
    };
  }, [userId, refetch]);

  const hasFeature = useCallback(
    (featureKey: FeatureKey): boolean => {
      if (loading) return false;
      if (grandfathered) return true;
      return unlockedKeys.has(featureKey);
    },
    [loading, grandfathered, unlockedKeys]
  );

  const isWallCleared = grandfathered || sentCount >= 4;
  const availableToUnlock = grandfathered ? [] : FEATURE_KEYS.filter((key) => !unlockedKeys.has(key));

  return {
    hasFeature,
    unspentPoints,
    inviteCount,
    sentCount,
    isWallCleared,
    availableToUnlock,
    inviteCode,
    loading,
  };
}
