import { supabase } from '../../config/supabase';
import type { Book, FriendProfile, FriendsLikedBook, UserBook } from './types';

/**
 * Get books recently liked by friends (status=read, rating=liked or rank_score >= 6.5)
 * Returns book details plus friend-only average score and friend list
 */
export async function getFriendsRecentLiked(
  userId: string,
  limit: number = 25
): Promise<FriendsLikedBook[]> {
  try {
    const { data: followingData, error: followingError } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followingError) {
      console.error('Error fetching following list:', followingError);
      throw new Error('Failed to fetch following list');
    }

    const friendIds = (followingData || [])
      .map((row) => row.following_id)
      .filter((id): id is string => Boolean(id));

    if (friendIds.length === 0) {
      return [];
    }

    const fetchLimit = Math.max(limit * 6, 120);

    const { data: userBooksData, error: userBooksError } = await supabase
      .from('user_books')
      .select(
        `
        id,
        user_id,
        book_id,
        rank_score,
        rating,
        status,
        updated_at,
        book:books(*)
        `
      )
      .in('user_id', friendIds)
      .eq('status', 'read')
      .or('rating.eq.liked,rank_score.gte.6.5')
      .order('updated_at', { ascending: false })
      .limit(fetchLimit);

    if (userBooksError) {
      console.error('Error fetching friends liked books:', userBooksError);
      throw new Error('Failed to fetch friends liked books');
    }

    if (!userBooksData || userBooksData.length === 0) {
      return [];
    }

    const userIds = Array.from(new Set(userBooksData.map((item) => item.user_id)));
    const { data: profilesData, error: profilesError } = await supabase
      .from('user_profiles')
      .select('user_id, username, profile_photo_url')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error fetching friend profiles:', profilesError);
    }

    const profileMap = new Map(
      (profilesData || []).map((profile) => [profile.user_id, profile as FriendProfile])
    );

    const grouped = new Map<
      string,
      {
        book: Book;
        friends: Map<string, FriendProfile>;
        scoreTotal: number;
        scoreCount: number;
        mostRecentUpdatedAt: string;
      }
    >();

    userBooksData.forEach((item) => {
      if (!item.book_id || !item.book) return;
      const bookId = item.book_id as string;
      const book = item.book as Book;

      const existing = grouped.get(bookId);
      const profile = profileMap.get(item.user_id) || {
        user_id: item.user_id,
        username: 'Unknown',
        profile_photo_url: null,
      };

      if (existing) {
        existing.friends.set(item.user_id, profile);
        if (typeof item.rank_score === 'number') {
          existing.scoreTotal += item.rank_score;
          existing.scoreCount += 1;
        }
        if (item.updated_at && item.updated_at > existing.mostRecentUpdatedAt) {
          existing.mostRecentUpdatedAt = item.updated_at;
        }
      } else {
        grouped.set(bookId, {
          book,
          friends: new Map([[item.user_id, profile]]),
          scoreTotal: typeof item.rank_score === 'number' ? item.rank_score : 0,
          scoreCount: typeof item.rank_score === 'number' ? 1 : 0,
          mostRecentUpdatedAt: item.updated_at || '',
        });
      }
    });

    const results: FriendsLikedBook[] = Array.from(grouped.entries())
      .map(([bookId, info]) => ({
        book_id: bookId,
        book: info.book,
        average_score: info.scoreCount > 0 ? info.scoreTotal / info.scoreCount : null,
        friends_count: info.friends.size,
        friends: Array.from(info.friends.values()),
        most_recent_updated_at: info.mostRecentUpdatedAt,
      }))
      .filter((item) => typeof item.average_score === 'number' && item.average_score >= 6.5)
      .sort((a, b) => (a.most_recent_updated_at < b.most_recent_updated_at ? 1 : -1))
      .slice(0, limit);

    return results;
  } catch (error) {
    console.error('Error fetching friends recent liked books:', error);
    throw error;
  }
}

/**
 * Get friends' user_books for a specific book that have been ranked
 * Returns user_books with user profile data, ordered by rank_score (highest first)
 * Supports pagination with offset and limit parameters
 */
export async function getFriendsRankingsForBook(
  bookId: string,
  userId: string,
  options?: {
    offset?: number;
    limit?: number;
  }
): Promise<{
  rankings: Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>;
  totalCount: number;
}> {
  try {
    // First, get the list of users the current user follows
    const { data: followingData, error: followingError } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followingError) {
      console.error('Error fetching following list:', followingError);
      throw new Error('Failed to fetch following list');
    }

    const friendIds = (followingData || [])
      .map((row) => row.following_id)
      .filter((id): id is string => Boolean(id));

    if (friendIds.length === 0) {
      return { rankings: [], totalCount: 0 };
    }

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // First, get total count
    const { count: totalCount, error: countError } = await supabase
      .from('user_books')
      .select('*', { count: 'exact', head: true })
      .eq('book_id', bookId)
      .in('user_id', friendIds)
      .not('rank_score', 'is', null);

    if (countError) {
      console.error('Error fetching friends rankings count:', countError);
      throw new Error('Failed to fetch rankings count');
    }

    // Query user_books for friends who have ranked this book (with pagination)
    const query = supabase
      .from('user_books')
      .select(
        `
        *,
        book:books(*)
      `
      )
      .eq('book_id', bookId)
      .in('user_id', friendIds)
      .not('rank_score', 'is', null)
      .order('rank_score', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: userBooksData, error: userBooksError } = await query;

    if (userBooksError) {
      console.error('Error fetching friends rankings:', userBooksError);
      throw new Error('Failed to fetch friends rankings');
    }

    if (!userBooksData || userBooksData.length === 0) {
      return { rankings: [], totalCount: totalCount ?? 0 };
    }

    // Fetch user profiles for all the users
    const userIds = Array.from(new Set(userBooksData.map((ub) => ub.user_id)));
    const { data: profilesData, error: profilesError } = await supabase
      .from('user_profiles')
      .select('user_id, username, profile_photo_url')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error fetching user profiles:', profilesError);
      // Still return rankings even if profile fetch fails (profiles will be undefined)
    }

    // Create a map of user_id to profile
    const profileMap = new Map(
      (profilesData || []).map((profile) => [profile.user_id, profile])
    );

    // Merge user_books with profiles
    const rankings = userBooksData.map((item) => ({
      ...item,
      book: item.book as Book,
      user_profile: profileMap.get(item.user_id),
    })) as Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>;

    return {
      rankings,
      totalCount: totalCount ?? 0,
    };
  } catch (error) {
    console.error('Error fetching friends rankings for book:', error);
    throw error;
  }
}
