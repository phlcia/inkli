import { supabase } from '../config/supabase';
import * as Contacts from 'expo-contacts';
import type { UserProfile } from './userProfile';

export interface MemberResult {
  user_id: string;
  username: string;
  name: string;
  profile_photo_url: string | null;
  account_type: 'public' | 'private';
}

export interface RecommendedUser extends MemberResult {
  mutual_count?: number | null;
  source: 'contacts' | 'graph' | 'popular';
}

type MatchContactsResponse = {
  matches?: {
    user_id: string;
    username: string;
    name: string | null;
    profile_photo_url: string | null;
    account_type: 'public' | 'private';
  }[];
};

/**
 * Fetch contact-based matches from the match-contacts Edge Function.
 * Assumes contacts permission has already been handled by the caller.
 */
export async function getContactMatches(userId: string): Promise<RecommendedUser[]> {
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const phones =
    data?.flatMap((contact) => contact.phoneNumbers?.map((p) => p.number).filter(Boolean) ?? []) ??
    [];

  if (!phones.length) {
    return [];
  }

  const { data: response, error } = await supabase.functions.invoke<MatchContactsResponse>(
    'match-contacts',
    {
      body: { phones, userId },
    }
  );

  if (error) {
    console.error('Error invoking match-contacts function:', error);
    return [];
  }

  const matches = response?.matches ?? [];

  return matches.map((m) => ({
    user_id: m.user_id,
    username: m.username,
    name: m.name ?? m.username,
    profile_photo_url: m.profile_photo_url,
    account_type: m.account_type,
    mutual_count: undefined,
    source: 'contacts',
  }));
}

type GraphRecommendedRow = {
  user_id: string;
  username: string;
  name: string | null;
  mutual_count: number | null;
  profile_photo_url: string | null;
  account_type: 'public' | 'private';
};

/**
 * Fetch graph-based "people you may know" recommendations via SQL RPC.
 */
export async function getGraphRecommendations(
  userId: string,
  limit: number = 10
): Promise<RecommendedUser[]> {
  const { data, error } = await supabase.rpc<GraphRecommendedRow>('get_recommended_users', {
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    console.error('Error fetching graph-based recommendations:', error);
    return [];
  }

  const rows = data ?? [];

  return rows.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    name: row.name ?? row.username,
    profile_photo_url: row.profile_photo_url,
    account_type: row.account_type,
    mutual_count: row.mutual_count ?? undefined,
    source: 'graph',
  }));
}

const POPULAR_READERS_FALLBACK_THRESHOLD = 5;

/**
 * Fallback: fetch active public readers the user doesn't already know about.
 * Only called when contacts + graph together return fewer than POPULAR_READERS_FALLBACK_THRESHOLD results.
 */
async function getPopularReaders(
  userId: string,
  excludeIds: Set<string>,
  limit: number
): Promise<RecommendedUser[]> {
  // Overfetch to account for client-side exclusion filtering
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, username, name, profile_photo_url, account_type')
    .eq('account_type', 'public')
    .neq('user_id', userId)
    .limit(limit + excludeIds.size + 10);

  if (error) {
    console.error('Error fetching popular readers fallback:', error);
    return [];
  }

  return (data ?? [])
    .filter((u) => !excludeIds.has(u.user_id))
    .slice(0, limit)
    .map((u) => ({
      user_id: u.user_id,
      username: u.username,
      name: u.name ?? u.username,
      profile_photo_url: u.profile_photo_url,
      account_type: u.account_type,
      mutual_count: undefined,
      source: 'popular' as const,
    }));
}

/**
 * Merge contacts-based and graph-based recommendations with graceful degradation.
 * - Uses Promise.allSettled so one failing source doesn't block the other.
 * - Dedupes by user_id, preferring contacts over graph.
 * - Falls back to popular public readers when combined results are sparse.
 */
export async function getMergedRecommendedUsers(userId: string): Promise<RecommendedUser[]> {
  const results = await Promise.allSettled([
    getContactMatches(userId),
    getGraphRecommendations(userId),
  ]);

  const contactsResult = results[0];
  const graphResult = results[1];

  const contacts: RecommendedUser[] =
    contactsResult.status === 'fulfilled' ? contactsResult.value : [];
  const graph: RecommendedUser[] = graphResult.status === 'fulfilled' ? graphResult.value : [];

  if (contactsResult.status === 'rejected' || graphResult.status === 'rejected') {
    console.warn('One or more recommended user sources failed', {
      contactsStatus: contactsResult.status,
      graphStatus: graphResult.status,
    });
  }

  const seen = new Set<string>();
  const merged: RecommendedUser[] = [];

  for (const user of contacts) {
    if (seen.has(user.user_id)) continue;
    seen.add(user.user_id);
    merged.push(user);
  }

  for (const user of graph) {
    if (seen.has(user.user_id)) continue;
    seen.add(user.user_id);
    merged.push(user);
  }

  // Fallback: if contacts + graph are both sparse, fill with popular public readers
  if (merged.length < POPULAR_READERS_FALLBACK_THRESHOLD) {
    const needed = POPULAR_READERS_FALLBACK_THRESHOLD - merged.length;
    const popular = await getPopularReaders(userId, seen, needed);
    for (const user of popular) {
      seen.add(user.user_id);
      merged.push(user);
    }
  }

  return merged;
}

