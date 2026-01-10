import { supabase } from './supabase';
import { ActivityLike } from '../types/activityLikes';

export async function toggleLike(
  userBookId: string,
  userId: string
): Promise<{ liked: boolean }> {
  try {
    const { error: insertError } = await supabase
      .from('activity_likes')
      .insert([{ user_book_id: userBookId, user_id: userId }]);

    if (!insertError) {
      return { liked: true };
    }

    if (insertError.code === '23505') {
      const { error: deleteError } = await supabase
        .from('activity_likes')
        .delete()
        .eq('user_book_id', userBookId)
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      return { liked: false };
    }

    throw insertError;
  } catch (error) {
    console.error('Error toggling activity like:', error);
    throw error;
  }
}

export async function getActivityLikes(
  userBookId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ActivityLike[]> {
  try {
    const { data, error } = await supabase
      .from('activity_likes')
      .select(
        `
        *,
        user:user_profiles!fk_activity_likes_user(user_id, username, profile_photo_url)
        `
      )
      .eq('user_book_id', userBookId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return (data || []).map((item: any) => ({
      ...item,
      user: item.user
        ? {
            id: item.user.user_id,
            username: item.user.username,
            avatar_url: item.user.profile_photo_url || undefined,
          }
        : undefined,
    })) as ActivityLike[];
  } catch (error) {
    console.error('Error fetching activity likes:', error);
    throw error;
  }
}

export async function checkUserLiked(
  userBookId: string,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('activity_likes')
      .select('id')
      .eq('user_book_id', userBookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return Boolean(data);
  } catch (error) {
    console.error('Error checking activity like:', error);
    throw error;
  }
}

export async function getLikesCount(userBookId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('activity_likes')
      .select('id', { count: 'exact', head: true })
      .eq('user_book_id', userBookId);

    if (error) {
      throw error;
    }

    return count ?? 0;
  } catch (error) {
    console.error('Error fetching likes count:', error);
    throw error;
  }
}
