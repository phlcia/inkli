import { supabase } from '../../config/supabase';
import type { BookCircleStats, BookCirclesResult, BookShelfCounts } from './types';

/**
 * Manually update community statistics for a specific book
 * This is a fallback function if triggers fail or for manual refreshes
 * Calculates the same AVG and COUNT as the database trigger
 */
export async function updateBookCommunityStats(
  bookId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('books-update-community-stats', {
      body: { book_id: bookId },
    });

    if (error) {
      console.error('Error updating book community stats via Edge Function:', error);
      return { success: false, error };
    }

    if (!data?.success) {
      const invalidResponse = new Error('Invalid response from books-update-community-stats');
      console.error('Error updating book community stats via Edge Function:', invalidResponse);
      return { success: false, error: invalidResponse };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception updating book community stats:', error);
    return { success: false, error };
  }
}

export async function getBookCircles(
  bookId: string,
  userId?: string | null
): Promise<BookCirclesResult> {
  const defaultStats: BookCircleStats = { average: null, count: 0 };

  const { data: globalData, error: globalError } = await supabase
    .from('books_stats')
    .select('global_avg_score, global_review_count')
    .eq('book_id', bookId)
    .single();

  if (globalError && globalError.code !== 'PGRST116') {
    throw globalError;
  }

  const global: BookCircleStats = {
    average: globalData?.global_avg_score ?? null,
    count: globalData?.global_review_count ?? 0,
  };

  if (!userId) {
    return { global, friends: defaultStats };
  }

  const { data: followsData, error: followsError } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (followsError) {
    throw followsError;
  }

  const friendIds = (followsData || [])
    .map((row) => row.following_id)
    .filter((id): id is string => Boolean(id));

  if (friendIds.length === 0) {
    return { global, friends: defaultStats };
  }

  const { data: friendsData, error: friendsError } = await supabase.rpc(
    'get_friends_book_stats',
    {
      p_book_id: bookId,
      p_friend_ids: friendIds,
    }
  );

  if (friendsError) {
    throw friendsError;
  }

  const friendsRow = Array.isArray(friendsData) ? friendsData[0] : friendsData;
  const friends: BookCircleStats = {
    average: friendsRow?.avg_score ?? null,
    count: friendsRow?.review_count ?? 0,
  };

  return { global, friends };
}

export async function getBookShelfCounts(bookId: string): Promise<BookShelfCounts> {
  const emptyCounts: BookShelfCounts = {
    read: 0,
    currently_reading: 0,
    want_to_read: 0,
  };

  try {
    const { data, error } = await supabase
      .from('books_stats')
      .select('shelf_count_read, shelf_count_currently_reading, shelf_count_want_to_read')
      .eq('book_id', bookId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading shelf counts:', error);
      return emptyCounts;
    }

    if (!data) return emptyCounts;

    return {
      read: data.shelf_count_read ?? 0,
      currently_reading: data.shelf_count_currently_reading ?? 0,
      want_to_read: data.shelf_count_want_to_read ?? 0,
    };
  } catch (error) {
    console.error('Error loading shelf counts:', error);
    return emptyCounts;
  }
}
