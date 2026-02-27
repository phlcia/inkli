import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

const PENDING_INVITE_CODE_KEY = 'pendingInviteCode';

export type FeatureKey =
  | 'community_scores'
  | 'activity_feed'
  | 'friend_recommendations'
  | 'friends_rankings'
  | 'leaderboard_circles';

export const FEATURE_KEYS: FeatureKey[] = [
  'community_scores',
  'activity_feed',
  'friend_recommendations',
  'friends_rankings',
  'leaderboard_circles',
];

export interface InviteProfile {
  invite_code: string;
  sent_invites_count: number;
  successful_invites_count: number;
  unspent_invite_points: number;
  grandfathered_invite_unlock: boolean;
}

export async function fetchInviteProfile(userId: string): Promise<{
  data: InviteProfile | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('invite_code, sent_invites_count, successful_invites_count, unspent_invite_points, grandfathered_invite_unlock')
      .eq('user_id', userId)
      .single();

    if (error) {
      return { data: null, error };
    }
    if (!data) {
      return { data: null, error: new Error('Profile not found') };
    }
    return {
      data: {
        invite_code: data.invite_code ?? '',
        sent_invites_count: data.sent_invites_count ?? 0,
        successful_invites_count: data.successful_invites_count ?? 0,
        unspent_invite_points: data.unspent_invite_points ?? 0,
        grandfathered_invite_unlock: Boolean(data.grandfathered_invite_unlock),
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export interface UnlockedFeatureRow {
  feature_key: FeatureKey;
}

export async function fetchUnlockedFeatures(userId: string): Promise<{
  data: UnlockedFeatureRow[];
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('user_unlocked_features')
      .select('feature_key')
      .eq('user_id', userId);

    if (error) {
      return { data: [], error };
    }
    return {
      data: (data ?? []).map((row) => ({ feature_key: row.feature_key as FeatureKey })),
      error: null,
    };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function acceptInvite(inviteCode: string): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke<{ error?: string }>('accept-invite', {
      method: 'POST',
      body: { invite_code: inviteCode },
    });

    if (error) {
      return { error: error.message ?? 'Failed to accept invite' };
    }
    if (data?.error) {
      return { error: data.error };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to accept invite' };
  }
}

export async function spendInvitePoint(featureKey: FeatureKey): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke<{ error?: string }>(
      'spend-invite-point',
      {
        method: 'POST',
        body: { feature_key: featureKey },
      }
    );

    if (error) {
      return { error: error.message ?? 'Failed to unlock feature' };
    }
    if (data?.error) {
      return { error: data.error };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to unlock feature' };
  }
}

/**
 * Opens the native share sheet with a fresh, single-use invite link.
 * The actual sent-invites count is incremented in the create-invite-link
 * edge function when the link row is created.
 */
export async function shareInviteLink(): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      code?: string;
      url?: string;
      error?: string;
    }>('create-invite-link', {
      method: 'POST',
    });

    if (error) {
      console.warn('shareInviteLink: create-invite-link error', error);
      return;
    }

    if (!data || !data.url) {
      console.warn('shareInviteLink: missing url from create-invite-link');
      return;
    }

    const url = data.url;
    const message =
      "HELLO i've been ranking all my books on inkli and i think you'd love it. join me? my link expires in 24 hours (˶ˆᗜˆ˵)\n" +
      url;

    await Share.share({
      message,
      url,
      title: 'Join me on Inkli',
    });
  } catch (e) {
    console.warn(
      'shareInviteLink: unexpected error',
      e instanceof Error ? e.message : String(e),
    );
  }
}

export async function storePendingInviteCode(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, code);
}

export async function getPendingInviteCode(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
}

export async function clearPendingInviteCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
}
