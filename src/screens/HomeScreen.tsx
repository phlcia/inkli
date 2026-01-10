import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../config/theme';
import { useAuth } from '../contexts/AuthContext';
import { fetchFollowedActivityCards } from '../services/activityFeed';
import { fetchUnreadNotificationsCount } from '../services/notifications';
import { ActivityFeedCursor, ActivityFeedItem } from '../types/activityCards';
import { supabase } from '../config/supabase';
import RecentActivityCard from '../components/RecentActivityCard';
import { HomeStackParamList } from '../navigation/HomeStackNavigator';

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList>>();
  const [cards, setCards] = useState<ActivityFeedItem[]>([]);
  const [cursor, setCursor] = useState<ActivityFeedCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paginating, setPaginating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadInitial = useCallback(async () => {
    if (!user) return;
    setInitialLoading(true);
    setErrorMessage(null);

    try {
      const result = await fetchFollowedActivityCards(user.id, { limit: 20 });
      setCards(result.cards);
      setCursor(result.nextCursor);
      setHasMore(result.cards.length === 20);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const offlineHint =
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('fetch');
      setErrorMessage(
        offlineHint
          ? "You're offline. Connect to the internet and try again."
          : 'Unable to load feed. Please try again.'
      );
    } finally {
      setInitialLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (!user) {
        setUnreadCount(0);
        return () => {
          isActive = false;
        };
      }

      fetchUnreadNotificationsCount(user.id)
        .then((count) => {
          if (isActive) setUnreadCount(count);
        })
        .catch((error) => {
          console.error('Error fetching unread notifications:', error);
        });

      return () => {
        isActive = false;
      };
    }, [user])
  );

  const handleRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setErrorMessage(null);

    try {
      const result = await fetchFollowedActivityCards(user.id, { limit: 20 });
      setCards(result.cards);
      setCursor(result.nextCursor);
      setHasMore(result.cards.length === 20);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const offlineHint =
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('fetch');
      setErrorMessage(
        offlineHint
          ? "You're offline. Connect to the internet and try again."
          : 'Unable to refresh feed. Please try again.'
      );
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  const handleLoadMore = useCallback(async () => {
    if (!user || !hasMore || paginating || refreshing || initialLoading) return;
    setPaginating(true);

    try {
      const result = await fetchFollowedActivityCards(user.id, {
        limit: 20,
        cursor,
      });
      setCards((prev) => [...prev, ...result.cards]);
      setCursor(result.nextCursor);
      setHasMore(result.cards.length === 20);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const offlineHint =
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('fetch');
      setErrorMessage(
        offlineHint
          ? "You're offline. Connect to the internet and try again."
          : 'Unable to load more posts.'
      );
    } finally {
      setPaginating(false);
    }
  }, [user, hasMore, paginating, refreshing, initialLoading, cursor]);

  const getActionText = useCallback((status: string, username: string) => {
    const displayName = username || 'User';
    switch (status) {
      case 'read':
        return `${displayName} finished`;
      case 'currently_reading':
        return `${displayName} started reading`;
      case 'want_to_read':
        return `${displayName} bookmarked`;
      default:
        return `${displayName} added`;
    }
  }, []);

  const formatDateForDisplay = useCallback((dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  const formatDateRange = useCallback(
    (startDate: string | null, endDate: string | null): string | null => {
      if (!startDate && !endDate) return null;
      if (startDate && endDate) {
        return `${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}`;
      }
      if (startDate) {
        return formatDateForDisplay(startDate);
      }
      if (endDate) {
        return formatDateForDisplay(endDate);
      }
      return null;
    },
    [formatDateForDisplay]
  );

  const handleBookPress = useCallback(
    async (userBook: ActivityFeedItem['userBook']) => {
      if (!userBook.book) return;

      try {
        const { data: fullBook, error } = await supabase
          .from('books')
          .select('*')
          .eq('id', userBook.book_id)
          .single();

        if (error) throw error;

        let userBookData = null;
        if (user?.id) {
          const { data } = await supabase
            .from('user_books')
            .select('*')
            .eq('user_id', user.id)
            .eq('book_id', fullBook.id)
            .single();
          userBookData = data;
        }

        navigation.navigate('BookDetail', {
          book: {
            ...fullBook,
            userBook: userBookData || null,
          },
        });
      } catch (error) {
        console.error('Error loading book details:', error);
      }
    },
    [navigation, user?.id]
  );

  const renderItem = useCallback(
    ({ item }: { item: ActivityFeedItem }) => (
      <RecentActivityCard
        userBook={item.userBook}
        actionText={getActionText(item.userBook.status, item.user.username)}
        userDisplayName={item.user.username}
        avatarUrl={item.user.profile_photo_url}
        avatarFallback={item.user.username?.charAt(0).toUpperCase() || 'U'}
        onPressBook={handleBookPress}
        onPressUser={() =>
          navigation.navigate('UserProfile', {
            userId: item.user.user_id,
            username: item.user.username,
          })
        }
        formatDateRange={formatDateRange}
        viewerStatus={null}
      />
    ),
    [formatDateRange, getActionText, handleBookPress, navigation]
  );

  const listEmptyComponent = useMemo(() => {
    if (initialLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      );
    }

    if (!user) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Home</Text>
          <Text style={styles.emptySubtitle}>
            Sign in to see your feed.
          </Text>
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Home</Text>
          <Text style={styles.emptySubtitle}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={loadInitial}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Home</Text>
        <Text style={styles.emptySubtitle}>No posts to see!</Text>
      </View>
    );
  }, [errorMessage, initialLoading, loadInitial, user]);

  const listFooterComponent = useMemo(() => {
    if (!paginating) return null;
    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator size="small" color={colors.primaryBlue} />
      </View>
    );
  }, [paginating]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>inkli</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            style={({ pressed }) => [
              styles.headerIcon,
              pressed && styles.headerIconPressed,
            ]}
            android_ripple={{ color: 'rgba(0, 0, 0, 0.06)' }}
          >
            <Image
              source={require('../../assets/heart.png')}
              style={styles.headerIconImage}
              resizeMode="contain"
            />
            {unreadCount > 0 ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={listFooterComponent}
        removeClippedSubviews
        initialNumToRender={6}
        windowSize={7}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  logoContainer: {
    flex: 1,
    flexShrink: 1,
    marginRight: 16,
  },
  logo: {
    fontSize: 32,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 16,
    flexShrink: 0,
  },
  headerIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    position: 'relative',
  },
  headerIconPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  headerIconImage: {
    width: 22,
    height: 22,
    tintColor: colors.brownText,
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#E76B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadgeText: {
    fontSize: 10,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  iconText: {
    fontSize: 20,
    color: colors.brownText,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: typography.body,
    fontSize: 14,
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
