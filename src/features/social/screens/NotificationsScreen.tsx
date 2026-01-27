import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { HomeStackParamList } from '../../../navigation/HomeStackNavigator';
import { supabase } from '../../../config/supabase';
import {
  fetchNotifications,
  NotificationItem,
  updateNotificationsLastSeen,
} from '../../../services/notifications';
import { acceptFollowRequest, rejectFollowRequest } from '../../../services/userProfile';
import { formatActivityTimestamp } from '../../../utils/dateUtils';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList>>();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [singleLineIds, setSingleLineIds] = useState<Set<string>>(new Set());

  const loadNotifications = useCallback(
    async (markSeen: boolean) => {
      if (!user) return;
      setErrorMessage(null);

      try {
        const result = await fetchNotifications(user.id);
        setNotifications(result.notifications);
        setLastSeenAt(result.lastSeenAt);
        if (markSeen) {
          await updateNotificationsLastSeen(user.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const offlineHint =
          message.toLowerCase().includes('network') ||
          message.toLowerCase().includes('fetch');
        setErrorMessage(
          offlineHint
            ? "You're offline. Connect to the internet and try again."
            : 'Unable to load notifications. Please try again.'
        );
      }
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      if (!user) {
        setNotifications([]);
        setLastSeenAt(null);
        setLoading(false);
        return () => {
          isActive = false;
        };
      }

      loadNotifications(true).finally(() => {
        if (isActive) setLoading(false);
      });
      return () => {
        isActive = false;
      };
    }, [loadNotifications, user])
  );

  const handleRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await loadNotifications(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadNotifications, user]);

  const data = useMemo(() => notifications, [notifications]);

  const handleNotificationPress = (item: NotificationItem) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });

    if (item.type === 'follow') {
      navigation.navigate('UserProfile', { userId: item.actorId });
      return;
    }

    if (item.type === 'follow_request') {
      navigation.navigate('UserProfile', { userId: item.actorId });
      return;
    }

    if (item.type === 'follow_accept' || item.type === 'follow_reject') {
      navigation.navigate('UserProfile', { userId: item.actorId });
      return;
    }

    if (item.type === 'comment' && item.userBookId) {
      navigation.navigate('ActivityComments', {
        userBookId: item.userBookId,
        actionText: `${item.actorName} commented on your ranking`,
      });
      return;
    }

    if (item.type === 'like' && item.userBookId) {
      navigation.navigate('ActivityComments', {
        userBookId: item.userBookId,
      });
    }
  };

  const handleTextLayout = useCallback(
    (id: string) => (event: { nativeEvent: { lines: { text: string }[] } }) => {
      const isSingleLine = event.nativeEvent.lines.length <= 1;
      setSingleLineIds((prev) => {
        const hasId = prev.has(id);
        if (isSingleLine === hasId) return prev;
        const next = new Set(prev);
        if (isSingleLine) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    },
    []
  );

  const renderActionText = (
    item: NotificationItem,
    onLayout: (event: { nativeEvent: { lines: { text: string }[] } }) => void
  ) => {
    const user = <Text style={styles.boldText}>{item.actorName}</Text>;
    const book = item.bookTitle ? (
      <Text style={styles.boldText}>{item.bookTitle}</Text>
    ) : null;
    const timestamp = (
      <Text style={styles.timestampInline}>
        {' '}
        {formatActivityTimestamp(item.createdAt)}
      </Text>
    );

    switch (item.type) {
      case 'like':
        return (
          <Text style={styles.actionText} onTextLayout={onLayout}>
            {user} liked your ranking of {book}
            {timestamp}
          </Text>
        );
      case 'comment':
        return (
          <Text style={styles.actionText} onTextLayout={onLayout}>
            {user} commented on your ranking of {book}:{' '}
            <Text style={styles.commentInline}>{item.commentText}</Text>
            {timestamp}
          </Text>
        );
      case 'follow':
        return (
          <Text style={styles.actionText} onTextLayout={onLayout}>
            {user} started following you
            {timestamp}
          </Text>
        );
      case 'follow_request':
        return (
          <Text style={styles.actionText} onTextLayout={onLayout}>
            {user} requested to follow you
            {timestamp}
          </Text>
        );
      case 'follow_accept':
        return (
          <Text style={styles.actionText} onTextLayout={onLayout}>
            {user} accepted your follow request
            {timestamp}
          </Text>
        );
      case 'follow_reject':
        return (
          <Text style={styles.actionText} onTextLayout={onLayout}>
            {user} declined your follow request
            {timestamp}
          </Text>
        );
      default:
        return null;
    }
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const isRead =
      readIds.has(item.id) ||
      (lastSeenAt
        ? new Date(item.createdAt).getTime() <=
          new Date(lastSeenAt).getTime()
        : false);
    const isSingleLine = singleLineIds.has(item.id);
    const handleAccept = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('follow_requests')
          .select('id')
          .eq('requester_id', item.actorId)
          .eq('requested_id', user.id)
          .eq('status', 'pending')
          .single();

        if (error || !data?.id) return;
        await acceptFollowRequest(data.id);
        await supabase.from('notifications').delete().eq('id', item.id);
        setNotifications((prev) => prev.filter((n) => n.id !== item.id));
      } catch (error) {
        console.error('Error accepting follow request:', error);
      }
    };

    const handleReject = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('follow_requests')
          .select('id')
          .eq('requester_id', item.actorId)
          .eq('requested_id', user.id)
          .eq('status', 'pending')
          .single();

        if (error || !data?.id) return;
        await rejectFollowRequest(data.id);
        await supabase.from('notifications').delete().eq('id', item.id);
        setNotifications((prev) => prev.filter((n) => n.id !== item.id));
      } catch (error) {
        console.error('Error rejecting follow request:', error);
      }
    };

    return (
      <Pressable
        onPress={() => handleNotificationPress(item)}
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
        ]}
        android_ripple={{ color: 'rgba(0, 0, 0, 0.04)' }}
      >
        {item.actorAvatarUrl ? (
          <Image
            source={{ uri: item.actorAvatarUrl }}
            style={styles.avatar}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>
              {item.actorName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.cardContent,
            isSingleLine && styles.cardContentCentered,
          ]}
        >
          <View style={styles.actionTextContainer}>
            {renderActionText(item, handleTextLayout(item.id))}
          </View>
        </View>
        {item.type === 'follow_request' && (
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={[styles.requestIconButton, styles.acceptIconButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleAccept();
              }}
            >
              <Text style={styles.requestIconText}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.requestIconButton, styles.rejectIconButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleReject();
              }}
            >
              <Text style={styles.requestIconText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Updates</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Updates</Text>
              <Text style={styles.emptySubtitle}>Loading...</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Updates</Text>
              <Text style={styles.emptySubtitle}>{errorMessage}</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Updates</Text>
              <Text style={styles.emptySubtitle}>No new updates!</Text>
            </View>
          )
        }
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    marginTop: Platform.OS === 'ios' ? 8 : 16,
    marginLeft: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.brownText,
    fontWeight: 'bold',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerSpacer: {
    width: 40,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
  },
  cardPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 14,
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 14,
    backgroundColor: colors.creamBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  cardContent: {
    flex: 1,
    paddingRight: 8,
    minHeight: 50,
    justifyContent: 'flex-start',
  },
  cardContentCentered: {
    justifyContent: 'center',
  },
  actionTextContainer: {
    flex: 1,
    paddingRight: 8,
  },
  actionText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  boldText: {
    fontWeight: '600',
    color: colors.brownText,
  },
  timestampInline: {
    fontSize: 13,
    color: colors.brownText,
    opacity: 0.6,
    fontFamily: typography.body,
  },
  commentInline: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.brownText,
    opacity: 0.8,
    fontFamily: typography.body,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestIconText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  acceptIconButton: {
    backgroundColor: colors.primaryBlue,
  },
  rejectIconButton: {
    backgroundColor: colors.brownText,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    textAlign: 'center',
  },
});
