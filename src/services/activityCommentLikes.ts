import { supabase } from './supabase';

export async function toggleCommentLike(
  commentId: string,
  userId: string
): Promise<{ liked: boolean }> {
  try {
    const { error: insertError } = await supabase
      .from('activity_comment_likes')
      .insert([{ comment_id: commentId, user_id: userId }]);

    if (!insertError) {
      return { liked: true };
    }

    if (insertError.code === '23505') {
      const { error: deleteError } = await supabase
        .from('activity_comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      return { liked: false };
    }

    throw insertError;
  } catch (error) {
    console.error('Error toggling comment like:', error);
    throw error;
  }
}

export async function getCommentLikes(
  commentIds: string[],
  userId?: string
): Promise<{ counts: Map<string, number>; likedIds: Set<string> }> {
  try {
    if (commentIds.length === 0) {
      return { counts: new Map(), likedIds: new Set() };
    }

    if (!userId) {
      return { counts: new Map(), likedIds: new Set() };
    }

    const { data, error } = await supabase
      .from('activity_comment_likes')
      .select('comment_id, user_id')
      .in('comment_id', commentIds)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    const counts = new Map<string, number>();
    const likedIds = new Set<string>();
    (data || []).forEach((row: any) => {
      likedIds.add(`${row.comment_id}:${row.user_id}`);
    });

    return { counts, likedIds };
  } catch (error) {
    console.error('Error fetching comment likes:', error);
    throw error;
  }
}

export async function getCommentLikesList(
  commentId: string,
  limit: number = 50,
  offset: number = 0
): Promise<
  { user_id: string; username: string; avatar_url?: string }[]
> {
  try {
    const { data, error } = await supabase
      .from('activity_comment_likes')
      .select(
        `
        user:user_profiles!fk_activity_comment_likes_user(user_id, username, profile_photo_url)
        `
      )
      .eq('comment_id', commentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return (data || [])
      .map((row: any) => row.user)
      .filter(Boolean)
      .map((user: any) => ({
        user_id: user.user_id,
        username: user.username,
        avatar_url: user.profile_photo_url || undefined,
      }));
  } catch (error) {
    console.error('Error fetching comment likes list:', error);
    throw error;
  }
}
