import { supabase } from './supabase';

export type NotificationType = 'like' | 'comment' | 'follow';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  createdAt: string;
  actorId: string;
  actorName: string;
  actorAvatarUrl: string | null;
  userBookId?: string;
  bookTitle?: string;
  commentText?: string;
};

type NotificationSourceData = {
  notifications: NotificationItem[];
  lastSeenAt: string | null;
};

export async function getNotificationsLastSeen(
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('notifications_last_seen_at')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data?.notifications_last_seen_at ?? null;
}

export async function updateNotificationsLastSeen(
  userId: string,
  timestamp: string = new Date().toISOString()
): Promise<void> {
  const { error } = await supabase
    .from('user_profiles')
    .update({ notifications_last_seen_at: timestamp })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function fetchNotifications(
  userId: string,
  limit: number = 40
): Promise<NotificationSourceData> {
  const [lastSeenAt, notificationsResult] = await Promise.all([
    getNotificationsLastSeen(userId),
    supabase
      .from('notifications')
      .select(
        `
        id,
        type,
        created_at,
        actor_id,
        user_book_id,
        comment_id,
        actor:user_profiles!fk_notifications_actor(user_id, username, profile_photo_url),
        user_book:user_books!fk_notifications_user_book(
          id,
          book:books!user_books_book_id_fkey(id, title)
        ),
        comment:activity_comments!fk_notifications_comment(id, comment_text)
        `
      )
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (notificationsResult.error) throw notificationsResult.error;

  const notifications: NotificationItem[] = (notificationsResult.data || []).map(
    (item: any) => ({
      id: item.id,
      type: item.type,
      createdAt: item.created_at,
      actorId: item.actor_id,
      actorName: item.actor?.username || 'User',
      actorAvatarUrl: item.actor?.profile_photo_url ?? null,
      userBookId: item.user_book?.id ?? undefined,
      bookTitle: item.user_book?.book?.title ?? undefined,
      commentText: item.comment?.comment_text ?? undefined,
    })
  );

  return { notifications, lastSeenAt };
}

export async function fetchUnreadNotificationsCount(
  userId: string
): Promise<number> {
  const lastSeenAt = await getNotificationsLastSeen(userId);
  const timestamp = lastSeenAt ?? '1970-01-01T00:00:00.000Z';

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .gt('created_at', timestamp);

  if (error) throw error;

  return count ?? 0;
}
