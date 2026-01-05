import { supabase } from '../config/supabase';
import { UserMention } from '../types/users';

const fetchMentionProfiles = async (
  userIds: string[],
  query: string,
  limit: number
): Promise<UserMention[]> => {
  if (userIds.length === 0 || limit <= 0) return [];

  let request = supabase
    .from('user_profiles')
    .select('user_id, username, avatar_url:profile_photo_url')
    .in('user_id', userIds)
    .order('username', { ascending: true })
    .limit(limit);

  if (query.trim()) {
    request = request.ilike('username', `%${query.trim()}%`);
  }

  const { data, error } = await request;
  if (error) {
    console.error('Error searching mention users:', error);
    return [];
  }

  return (data || []) as UserMention[];
};

export async function searchUsersForMention(
  query: string,
  currentUserId: string,
  limit: number = 10
): Promise<UserMention[]> {
  try {
    const [{ data: followingData, error: followingError }, { data: followerData, error: followerError }] =
      await Promise.all([
        supabase
          .from('user_follows')
          .select('following_id')
          .eq('follower_id', currentUserId),
        supabase
          .from('user_follows')
          .select('follower_id')
          .eq('following_id', currentUserId),
      ]);

    if (followingError) {
      console.error('Error fetching following for mentions:', followingError);
    }
    if (followerError) {
      console.error('Error fetching followers for mentions:', followerError);
    }

    const followingIds = (followingData || [])
      .map((row: any) => row.following_id)
      .filter((id: string) => id && id !== currentUserId);
    const followerIds = (followerData || [])
      .map((row: any) => row.follower_id)
      .filter((id: string) => id && id !== currentUserId);

    const seen = new Set<string>();
    const results: UserMention[] = [];

    const uniqueFollowing = followingIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const followingResults = await fetchMentionProfiles(
      uniqueFollowing,
      query,
      limit
    );
    results.push(...followingResults);

    const remaining = limit - results.length;
    if (remaining > 0) {
      const uniqueFollowers = followerIds.filter((id) => !seen.has(id));
      const followerResults = await fetchMentionProfiles(
        uniqueFollowers,
        query,
        remaining
      );
      results.push(...followerResults);
    }

    return results.slice(0, limit);
  } catch (error) {
    console.error('Exception searching mention users:', error);
    return [];
  }
}
