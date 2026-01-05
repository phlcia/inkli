import { supabase } from './supabase';
import { ActivityComment } from '../types/activityComments';

const MAX_COMMENT_LENGTH = 1000;

function validateCommentText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Comment cannot be empty.');
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error('Comment exceeds maximum length.');
  }
  return trimmed;
}

export async function addComment(
  userBookId: string,
  userId: string,
  commentText: string
): Promise<ActivityComment> {
  try {
    const trimmed = validateCommentText(commentText);
    const { data, error } = await supabase
      .from('activity_comments')
      .insert([
        {
          user_book_id: userBookId,
          user_id: userId,
          comment_text: trimmed,
        },
      ])
      .select(
        `
        *,
        user:user_profiles!fk_activity_comments_user(user_id, username, profile_photo_url)
        `
      )
      .single();

    if (error) {
      throw error;
    }

    return {
      ...(data as any),
      user: data?.user
        ? {
            user_id: data.user.user_id,
            username: data.user.username,
            avatar_url: data.user.profile_photo_url || undefined,
          }
        : undefined,
    } as ActivityComment;
  } catch (error) {
    console.error('Error adding activity comment:', error);
    throw error;
  }
}

export async function addReply(
  userBookId: string,
  userId: string,
  parentCommentId: string,
  commentText: string
): Promise<ActivityComment> {
  try {
    const trimmed = validateCommentText(commentText);
    const { data, error } = await supabase
      .from('activity_comments')
      .insert([
        {
          user_book_id: userBookId,
          user_id: userId,
          parent_comment_id: parentCommentId,
          comment_text: trimmed,
        },
      ])
      .select(
        `
        *,
        user:user_profiles!fk_activity_comments_user(user_id, username, profile_photo_url)
        `
      )
      .single();

    if (error) {
      throw error;
    }

    return {
      ...(data as any),
      user: data?.user
        ? {
            user_id: data.user.user_id,
            username: data.user.username,
            avatar_url: data.user.profile_photo_url || undefined,
          }
        : undefined,
    } as ActivityComment;
  } catch (error) {
    console.error('Error adding activity reply:', error);
    throw error;
  }
}

export async function getActivityComments(
  userBookId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ActivityComment[]> {
  try {
    const { data, error } = await supabase
      .from('activity_comments')
      .select(
        `
        *,
        user:user_profiles!fk_activity_comments_user(user_id, username, profile_photo_url)
        `
      )
      .eq('user_book_id', userBookId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return (data || []).map((item: any) => ({
      ...item,
      user: item.user
        ? {
            user_id: item.user.user_id,
            username: item.user.username,
            avatar_url: item.user.profile_photo_url || undefined,
          }
        : undefined,
    })) as ActivityComment[];
  } catch (error) {
    console.error('Error fetching activity comments:', error);
    throw error;
  }
}

export async function deleteComment(
  commentId: string,
  userId: string
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('activity_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Not authorized to delete this comment.');
    }
  } catch (error) {
    console.error('Error deleting activity comment:', error);
    throw error;
  }
}

export async function updateComment(
  commentId: string,
  userId: string,
  newText: string
): Promise<ActivityComment> {
  try {
    const trimmed = validateCommentText(newText);
    const { data, error } = await supabase
      .from('activity_comments')
      .update({ comment_text: trimmed })
      .eq('id', commentId)
      .eq('user_id', userId)
      .select(
        `
        *,
        user:user_profiles!fk_activity_comments_user(user_id, username, profile_photo_url)
        `
      )
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Not authorized to update this comment.');
    }

    return {
      ...(data as any),
      user: data.user
        ? {
            user_id: data.user.user_id,
            username: data.user.username,
            avatar_url: data.user.profile_photo_url || undefined,
          }
        : undefined,
    } as ActivityComment;
  } catch (error) {
    console.error('Error updating activity comment:', error);
    throw error;
  }
}

export async function getCommentsCount(userBookId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_books')
      .select('comments_count')
      .eq('id', userBookId)
      .single();

    if (error) {
      throw error;
    }

    return data?.comments_count ?? 0;
  } catch (error) {
    console.error('Error fetching comments count:', error);
    throw error;
  }
}
