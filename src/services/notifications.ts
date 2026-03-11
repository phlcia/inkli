import * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const EXPO_PROJECT_ID = '9ed75875-385f-41e2-a97b-c163e9ebf418';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'follow_reject'
  | 'invite_accepted';

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

  let notifications: NotificationItem[] = (notificationsResult.data || []).map(
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

  const followRequestNotifications = notifications.filter(
    (item) => item.type === 'follow_request'
  );
  if (followRequestNotifications.length > 0) {
    const requesterIds = Array.from(
      new Set(followRequestNotifications.map((item) => item.actorId))
    );
    const { data: pendingRequests, error: pendingError } = await supabase
      .from('follow_requests')
      .select('requester_id')
      .eq('requested_id', userId)
      .eq('status', 'pending')
      .in('requester_id', requesterIds);

    if (pendingError) throw pendingError;

    const pendingRequesterIds = new Set(
      (pendingRequests || []).map((row: any) => row.requester_id)
    );
    notifications = notifications.filter(
      (item) =>
        item.type !== 'follow_request' ||
        pendingRequesterIds.has(item.actorId)
    );
  }

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

export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await ExpoNotifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: ExpoNotifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4EACE3',
        sound: 'default',
      });
    }

    const { status: existingStatus } = await ExpoNotifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await ExpoNotifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await ExpoNotifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: tokenData.data,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' }
    );
  } catch (error) {
    console.warn('Failed to register push token:', error);
  }
}

export async function requestBadgePermission(): Promise<void> {
  await ExpoNotifications.requestPermissionsAsync({
    ios: {
      allowBadge: true,
      allowAlert: false,
      allowSound: false,
    },
  });
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await ExpoNotifications.setBadgeCountAsync(count);
  } catch {
    // Non-critical; silently ignore
  }
}

export async function clearBadge(): Promise<void> {
  try {
    await ExpoNotifications.setBadgeCountAsync(0);
  } catch {
    // Non-critical; silently ignore
  }
}
