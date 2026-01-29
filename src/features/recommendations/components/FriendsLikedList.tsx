import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { FriendsLikedBook, getFriendsRecentLiked, formatCount } from '../../../services/books';
import { getScoreColor } from '../../../utils/rankScoreColors';
import { supabase } from '../../../config/supabase';

type FriendsLikedListProps = {
  userId: string;
  limit?: number;
  showHeader?: boolean;
};

export default function FriendsLikedList({
  userId,
  limit = 25,
  showHeader = true,
}: FriendsLikedListProps) {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<FriendsLikedBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!userId) return;
    setError(null);
    setLoading(true);
    try {
      const results = await getFriendsRecentLiked(userId, limit);
      setItems(results);
    } catch (err) {
      console.error('Error loading friends liked books:', err);
      setError('Failed to load friends activity');
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadItems();
    } finally {
      setRefreshing(false);
    }
  }, [loadItems]);

  const handleBookPress = useCallback(
    async (item: FriendsLikedBook) => {
      try {
        const { data: fullBook, error: bookError } = await supabase
          .from('books')
          .select('*')
          .eq('id', item.book_id)
          .single();

        if (bookError) throw bookError;

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
        Alert.alert('Error', 'Could not load book details');
      }
    },
    [navigation, user?.id]
  );

  const formatAverage = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '--';
    return value.toFixed(1);
  };

  const buildFriendsText = (friends: FriendsLikedBook['friends'], count: number) => {
    if (count <= 0) return 'No friends liked this yet';
    if (count <= 2) {
      const names = friends
        .slice(0, 2)
        .map((friend) => (friend.username ? `@${friend.username}` : 'a friend'));
      return `Liked by ${names.join(', ')}`;
    }
    return `${count} friends liked this`;
  };

  const renderFriendAvatar = (
    friend: FriendsLikedBook['friends'][number],
    index: number
  ) => {
    const initial = friend.username?.charAt(0)?.toUpperCase() || 'U';
    return friend.profile_photo_url ? (
      <Image
        key={friend.user_id}
        source={{ uri: friend.profile_photo_url }}
        style={[styles.friendAvatar, index > 0 && styles.friendAvatarOverlap]}
      />
    ) : (
      <View key={friend.user_id} style={[styles.friendAvatar, index > 0 && styles.friendAvatarOverlap]}>
        <Text style={styles.friendAvatarText}>{initial}</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: FriendsLikedBook }) => {
    const averageScore = item.average_score;
    const scoreColor = averageScore !== null && averageScore >= 6.5
      ? '#2FA463'
      : getScoreColor(averageScore);
    const friendsToShow = item.friends.slice(0, 3);
    const friendsText = buildFriendsText(item.friends, item.friends_count);

    return (
      <TouchableOpacity
        style={styles.bookItem}
        activeOpacity={0.7}
        onPress={() => handleBookPress(item)}
      >
        <View style={styles.coverWrapper}>
          {item.book.cover_url ? (
            <Image source={{ uri: item.book.cover_url }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverPlaceholderText}>
                {item.book.title?.charAt(0)?.toUpperCase() || 'B'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {item.book.title}
          </Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>
            {item.book.authors?.join(', ') || 'Unknown Author'}
          </Text>
          <View style={styles.friendsRow}>
            <View style={styles.friendAvatars}>
              {friendsToShow.map((friend, index) => renderFriendAvatar(friend, index))}
            </View>
            <Text style={styles.friendsText} numberOfLines={1}>
              {friendsText}
            </Text>
          </View>
        </View>

        <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
          <Text style={styles.scoreText}>{formatAverage(averageScore)}</Text>
          {item.friends_count > 0 && (
            <View style={styles.circleCountBadge}>
              <Text style={styles.circleCountText}>
                {formatCount(item.friends_count)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
        <Text style={styles.loadingText}>Loading friends activity...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadItems}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.book_id}
          renderItem={renderItem}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primaryBlue} />
          }
          ListHeaderComponent={
            showHeader ? (
              <View style={styles.header}>
                <Text style={styles.title}>From Your Friends</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No friend activity yet.</Text>
              <Text style={styles.emptySubtext}>
                Follow more friends to see what they are enjoying.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
  },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  coverWrapper: {
    marginRight: 12,
  },
  cover: {
    width: 54,
    height: 80,
    borderRadius: 6,
    backgroundColor: colors.creamBackground,
  },
  coverPlaceholder: {
    width: 54,
    height: 80,
    borderRadius: 6,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderText: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  bookInfo: {
    flex: 1,
    marginRight: 12,
  },
  bookTitle: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  friendsRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendAvatars: {
    flexDirection: 'row',
    marginRight: 8,
  },
  friendAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryBlue,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarOverlap: {
    marginLeft: -6,
  },
  friendAvatarText: {
    fontSize: 10,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  friendsText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.8,
    flexShrink: 1,
  },
  scoreCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  scoreText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  circleCountBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brownText,
    borderWidth: 2,
    borderColor: colors.creamBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCountText: {
    fontSize: 10,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
});
