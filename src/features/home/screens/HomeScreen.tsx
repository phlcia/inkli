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
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchFollowedActivityCards } from '../../../services/activityFeed';
import { fetchUnreadNotificationsCount } from '../../../services/notifications';
import { ActivityFeedCursor, ActivityFeedItem } from '../../../types/activityCards';
import RecentActivityCard from '../../social/components/RecentActivityCard';
import { HomeStackParamList } from '../../../navigation/HomeStackNavigator';
import { formatDateRange as formatDateRangeUtil } from '../../../utils/dateRanges';
import { getActionText } from '../../../utils/activityText';
import { fetchBookWithUserStatus } from '../../../services/bookDetails';
import { supabase } from '../../../config/supabase';
import { useToggleWantToRead } from '../../books/hooks/useToggleWantToRead';
import type { UserBook } from '../../../services/books';
import heartIcon from '../../../../assets/heart.png';
import searchIcon from '../../../../assets/search.png';

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
  const [viewerShelfMap, setViewerShelfMap] = useState<Record<string, { id: string; status: UserBook['status'] }>>({});

  const handleToggleWantToRead = useToggleWantToRead({
    currentUserId: user?.id,
    viewerShelfMap,
    setViewerShelfMap,
  });

  const hydrateViewerShelfMap = useCallback(
    async (nextCards: ActivityFeedItem[], replace: boolean) => {
      if (!user?.id) {
        if (replace) setViewerShelfMap({});
        return;
      }
      const bookIds = Array.from(
        new Set(
          nextCards
            .map((item) => item.userBook.book_id)
            .filter((bookId): bookId is string => !!bookId)
        )
      );
      if (bookIds.length === 0) {
        if (replace) setViewerShelfMap({});
        return;
      }
      const missingIds = replace ? bookIds : bookIds.filter((id) => !viewerShelfMap[id]);
      if (missingIds.length === 0) return;

      const { data, error } = await supabase
        .from('user_books')
        .select('id, book_id, status')
        .eq('user_id', user.id)
        .in('book_id', missingIds);

      if (error) {
        console.error('Error loading viewer shelf status:', error);
        if (replace) setViewerShelfMap({});
        return;
      }

      const map: Record<string, { id: string; status: UserBook['status'] }> = {};
      (data || []).forEach((item: any) => {
        map[item.book_id] = { id: item.id, status: item.status };
      });

      setViewerShelfMap((prev) => (replace ? map : { ...prev, ...map }));
    },
    [user?.id, viewerShelfMap]
  );

  const loadInitial = useCallback(async () => {
    if (!user) return;
    setInitialLoading(true);
    setErrorMessage(null);

    try {
      const result = await fetchFollowedActivityCards(user.id, { limit: 20 });
      setCards(result.cards);
      setCursor(result.nextCursor);
      setHasMore(result.cards.length === 20);
      await hydrateViewerShelfMap(result.cards, true);
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
  }, [user, hydrateViewerShelfMap]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!user?.id) {
      setViewerShelfMap({});
    }
  }, [user?.id]);

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
      await hydrateViewerShelfMap(result.cards, true);
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
  }, [user, hydrateViewerShelfMap]);

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
      await hydrateViewerShelfMap(result.cards, false);
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
  }, [user, hasMore, paginating, refreshing, initialLoading, cursor, hydrateViewerShelfMap]);

  const formatDateRange = useCallback(
    (startDate: string | null, endDate: string | null): string | null =>
      formatDateRangeUtil(startDate, endDate),
    []
  );

  const getActionTextForItem = useCallback(
    (status: string | null, username: string, activityContent?: string | null) =>
      getActionText({ status, displayName: username, activityContent }),
    []
  );

  const handleBookPress = useCallback(
    async (userBook: ActivityFeedItem['userBook']) => {
      if (!userBook.book) return;

      try {
        const { book, userBook: userBookData } = await fetchBookWithUserStatus(
          userBook.book_id,
          user?.id
        );

        navigation.navigate('BookDetail', {
          book: {
            ...book,
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
        actionText={getActionTextForItem(
          item.userBook.status,
          item.user.username,
          item.content
        )}
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
        viewerStatus={
          item.userBook.book_id ? viewerShelfMap[item.userBook.book_id]?.status || null : null
        }
        onToggleWantToRead={
          user?.id ? () => handleToggleWantToRead(item.userBook) : undefined
        }
      />
    ),
    [
      formatDateRange,
      getActionTextForItem,
      handleBookPress,
      handleToggleWantToRead,
      navigation,
      user?.id,
      viewerShelfMap,
    ]
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
              source={heartIcon}
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

      {/* Search Bar */}
      <Pressable
        style={({ pressed }) => [
          styles.searchBar,
          pressed && styles.searchBarPressed,
        ]}
        onPress={() => navigation.getParent()?.navigate('Search')}
        android_ripple={{ color: 'rgba(0, 0, 0, 0.06)' }}
      >
        <Image
          source={searchIcon}
          style={styles.searchIcon}
          resizeMode="contain"
        />
        <Text style={styles.searchBarText}>Search for books or members...</Text>
      </Pressable>

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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  searchBarPressed: {
    backgroundColor: '#F0F0F0',
  },
  searchIcon: {
    width: 30,
    height: 30,
    marginRight: 8,
    tintColor: colors.brownText,
  },
  searchBarText: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.body,
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
