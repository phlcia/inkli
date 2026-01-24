import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, typography } from '../../../config/theme';
import {
  fetchRecommendations,
  refreshRecommendations,
  Recommendation,
  markRecommendationsShown,
  markRecommendationClicked,
} from '../../../services/recommendations';
import { useAuth } from '../../../contexts/AuthContext';
import { getBookCircles, BookCircleStats, formatCount } from '../../../services/books';
import { supabase } from '../../../config/supabase';

type RecommendationsListProps = {
  showHeader?: boolean;
};

export default function RecommendationsList({ showHeader = true }: RecommendationsListProps) {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [circleStats, setCircleStats] = useState<Map<string, BookCircleStats>>(new Map());
  const [circleLoading, setCircleLoading] = useState<Set<string>>(new Set());

  const loadCircleStats = useCallback(async (bookIds: string[]) => {
    const newStats = new Map<string, BookCircleStats>();
    const loadingSet = new Set<string>();

    // Mark all as loading
    bookIds.forEach((id) => loadingSet.add(id));
    setCircleLoading(new Set(loadingSet));

    // Fetch circle stats for all books in parallel
    const promises = bookIds.map(async (bookId) => {
      try {
        const result = await getBookCircles(bookId, null);
        return { bookId, stats: result.global };
      } catch (err) {
        console.error(`Error loading circle stats for book ${bookId}:`, err);
        return { bookId, stats: { average: null, count: 0 } };
      }
    });

    const results = await Promise.all(promises);
    results.forEach(({ bookId, stats }) => {
      newStats.set(bookId, stats);
      loadingSet.delete(bookId);
    });

    setCircleStats((prev) => {
      const updated = new Map(prev);
      results.forEach(({ bookId, stats }) => {
        updated.set(bookId, stats);
      });
      return updated;
    });
    setCircleLoading(new Set(loadingSet));
  }, []);

  const loadRecommendations = useCallback(async (isRefresh = false) => {
    if (!user) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { data, error: recError } = await fetchRecommendations(user.id);
      if (recError) {
        setError(recError.message);
        return;
      }
      setRecommendations(data || []);
      
      // Load circle stats for all recommended books
      if (data && data.length > 0) {
        const bookIds = data.map((rec) => rec.book_id).filter(Boolean);
        if (bookIds.length > 0) {
          await loadCircleStats(bookIds);
        }
      }
    } catch (err) {
      console.error('Error loading recommendations:', err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, loadCircleStats]);

  useFocusEffect(
    useCallback(() => {
      loadRecommendations();
    }, [loadRecommendations])
  );

  useEffect(() => {
    if (recommendations.length === 0) return;
    const unseenIds = recommendations
      .filter((rec) => !rec.shown_at)
      .map((rec) => rec.id);
    if (unseenIds.length === 0) return;
    markRecommendationsShown(unseenIds);
  }, [recommendations]);

  const handleRefresh = useCallback(async () => {
    if (!user) return;

    setRefreshing(true);
    setError(null);

    try {
      const { data, error: recError } = await refreshRecommendations();
      if (recError) {
        setError(recError.message);
        return;
      }
      setRecommendations(data || []);
      
      // Load circle stats for all recommended books
      if (data && data.length > 0) {
        const bookIds = data.map((rec) => rec.book_id).filter(Boolean);
        if (bookIds.length > 0) {
          await loadCircleStats(bookIds);
        }
      }
    } catch (err) {
      console.error('Error refreshing recommendations:', err);
      setError('Failed to refresh recommendations');
    } finally {
      setRefreshing(false);
    }
  }, [user, loadCircleStats]);

  const handleBookPress = useCallback(async (rec: Recommendation) => {
    if (!rec.book) return;
    
    markRecommendationClicked(rec.id);

    try {
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', rec.book_id)
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
      Alert.alert('Error', 'Could not load book details');
    }
  }, [user, navigation]);

  // Helper functions matching BookDetailScreen
  const formatCircleScore = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '--';
    return value.toFixed(1);
  };

  const formatCircleCount = (value: number | null | undefined) => {
    return formatCount(value ?? 0);
  };

  const getScoreTierColor = (score: number | null | undefined, count: number) => {
    if (!count || score === null || score === undefined) {
      return colors.brownText;
    }
    if (score <= 3.5) {
      return '#D96B6B';
    }
    if (score <= 6.5) {
      return '#E2B34C';
    }
    return '#2FA463';
  };

  const renderBookItem = (rec: Recommendation, index: number) => {
    const bookData = rec.book;
    if (!bookData) return null;

    const stats = circleStats.get(rec.book_id) || { average: null, count: 0 };
    const isLoading = circleLoading.has(rec.book_id);
    const score = isLoading ? null : stats.average;
    const count = isLoading ? 0 : stats.count;
    const scoreColor = getScoreTierColor(score, count);

    return (
      <TouchableOpacity
        key={rec.id}
        style={styles.bookItem}
        activeOpacity={0.7}
        onPress={() => handleBookPress(rec)}
      >
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {bookData.title}
          </Text>
          {bookData.categories && bookData.categories.length > 0 && (
            <Text style={styles.bookCategories} numberOfLines={1}>
              {bookData.categories.slice(0, 2).join(', ')}
            </Text>
          )}
          {bookData.authors && bookData.authors.length > 0 && (
            <Text style={styles.bookAuthor} numberOfLines={1}>
              {bookData.authors.join(', ')}
            </Text>
          )}
        </View>

        <View style={[styles.ratingCircle, { backgroundColor: scoreColor }]}>
          <Text style={styles.circleScore}>
            {formatCircleScore(score)}
          </Text>
          {Boolean(count) && (
            <View style={styles.circleCountBadge}>
              <Text style={styles.circleCountText}>
                {formatCircleCount(count)}
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
        <Text style={styles.loadingText}>Loading recommendations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={styles.header}>
          <Text style={styles.title}>Recommendations</Text>
          <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primaryBlue} />
            ) : (
              <Text style={styles.refreshButtonText}>Refresh</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadRecommendations()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : recommendations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No recommendations yet.</Text>
          <Text style={styles.emptySubtext}>
            Keep ranking books to improve your recommendations.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primaryBlue} />
          }
        >
          {recommendations.map((rec, index) => renderBookItem(rec, index))}
        </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
  },
  refreshButton: {
    padding: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.primaryBlue,
    fontWeight: '600',
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
    paddingVertical: 16,
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
  bookCategories: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    marginBottom: 2,
  },
  bookAuthor: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  ratingCircle: {
    width: 60,
    height: 60,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  circleScore: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  circleCountBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brownText,
    borderWidth: 2,
    borderColor: colors.creamBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCountText: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
});
