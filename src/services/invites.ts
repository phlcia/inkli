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
 * Creates a single-use invite link and returns the URL without opening a share sheet.
 * Used by InviteGateScreen and InviteContactsPickerScreen to send invites via SMS.
 * Pass targetPhone (E.164) to associate the link with a specific contact — this enables
 * phone-based invite matching at signup even if the deep link URL is lost on new installs.
 */
export async function createInviteLinkForContact(targetPhone?: string | null): Promise<{ url: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      code?: string;
      url?: string;
      error?: string;
    }>('create-invite-link', {
      method: 'POST',
      body: targetPhone ? { target_phone: targetPhone } : undefined,
    });

    if (error) {
      return { url: null, error: error.message ?? 'Failed to create invite link' };
    }
    if (!data?.url) {
      return { url: null, error: 'Missing URL from invite link creation' };
    }
    return { url: data.url, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : 'Failed to create invite link' };
  }
}

/**
 * Attempts to match the current user to a pending invite by phone number.
 * Should be called immediately after the user's phone is saved to user_private_data.
 * Non-fatal: errors are logged but not thrown.
 */
export async function acceptInviteByPhone(): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('accept-invite-by-phone', {
      method: 'POST',
    });
    if (error) {
      console.warn('acceptInviteByPhone failed (non-fatal):', error);
    }
  } catch (e) {
    console.warn('acceptInviteByPhone failed (non-fatal):', e);
  }
}

/** Stored with a timestamp so we can expire stale pending codes without relying only on edge error strings. */
export type PendingInvitePayload = { code: string; savedAt: number };

function parsePendingInviteRaw(raw: string): PendingInvitePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed !== null &&
      'code' in parsed &&
      typeof (parsed as PendingInvitePayload).code === 'string'
    ) {
      const p = parsed as PendingInvitePayload;
      return {
        code: p.code,
        savedAt: typeof p.savedAt === 'number' ? p.savedAt : Date.now(),
      };
    }
  } catch {
    // Legacy: plain invite code string (before JSON payload)
    return { code: raw, savedAt: Date.now() };
  }
  return null;
}

export async function storePendingInviteCode(code: string): Promise<void> {
  const payload: PendingInvitePayload = { code, savedAt: Date.now() };
  await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, JSON.stringify(payload));
}

export async function getPendingInviteCode(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
  if (!raw) return null;
  const parsed = parsePendingInviteRaw(raw);
  return parsed?.code ?? null;
}

/** Code plus when it was stored (for TTL-based clearing). */
export async function getPendingInviteWithStoredAt(): Promise<PendingInvitePayload | null> {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
  if (!raw) return null;
  return parsePendingInviteRaw(raw);
}

export async function clearPendingInviteCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
}
