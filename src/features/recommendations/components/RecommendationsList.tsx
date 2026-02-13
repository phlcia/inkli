import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography } from '../../../config/theme';
import {
  fetchRecommendations,
  refreshRecommendations,
  Recommendation,
  markRecommendationsShown,
  markRecommendationClicked,
} from '../../../services/recommendations';
import { useAuth } from '../../../contexts/AuthContext';
import { useErrorHandler } from '../../../contexts/ErrorHandlerContext';
import { getBookCircles, BookCircleStats, formatCount } from '../../../services/books';
import { supabase } from '../../../config/supabase';
import { isBookSparse } from '../../../utils/bookHelpers';
import { enrichBook } from '../../../services/enrichment';

type RecommendationsListProps = {
  showHeader?: boolean;
};

const LAST_SEEN_RECS_KEY = 'last_seen_recs';

export default function RecommendationsList({ showHeader = true }: RecommendationsListProps) {
  const { user } = useAuth();
  const { handleApiError } = useErrorHandler();
  const navigation = useNavigation<any>();
  const pageSize = 30;
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [displayCount, setDisplayCount] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [enrichingBookId, setEnrichingBookId] = useState<string | null>(null);
  const [circleStats, setCircleStats] = useState<Map<string, BookCircleStats>>(new Map());
  const [circleLoading, setCircleLoading] = useState<Set<string>>(new Set());
  const [lastSeenRefreshTime, setLastSeenRefreshTime] = useState<Date | null>(null);

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

  const loadRecommendations = useCallback(async (targetPage = 0, append = false) => {
    if (!user) return;

    const isInitial = targetPage === 0 && !append;
    if (isInitial) {
      setLoading(true);
      setDisplayCount(10);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const { data, error: recError } = await fetchRecommendations(user.id, {
        limit: pageSize,
        offset: targetPage * pageSize,
      });
      if (recError) {
        setError(recError.message);
        return;
      }
      const nextRecommendations = data || [];
      setRecommendations((prev) => (append ? [...prev, ...nextRecommendations] : nextRecommendations));
      setPage(targetPage);
      setHasMore(nextRecommendations.length === pageSize);
      
      // Load circle stats for all recommended books
      if (nextRecommendations.length > 0) {
        const bookIds = nextRecommendations.map((rec) => rec.book_id).filter(Boolean);
        if (bookIds.length > 0) {
          await loadCircleStats(bookIds);
        }
      }
    } catch (err) {
      console.error('Error loading recommendations:', err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, loadCircleStats, pageSize]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadLastSeen = async () => {
        try {
          const stored = await AsyncStorage.getItem(LAST_SEEN_RECS_KEY);
          if (stored && isActive) {
            setLastSeenRefreshTime(new Date(stored));
          }
        } catch (storageError) {
          console.error('Error loading last seen recs time:', storageError);
        }
      };

      loadLastSeen();
      loadRecommendations(0, false);

      return () => {
        isActive = false;
      };
    }, [loadRecommendations])
  );

  const displayedRecommendations = recommendations.slice(0, displayCount);

  useEffect(() => {
    if (displayedRecommendations.length === 0) return;
    const unseenIds = displayedRecommendations
      .filter((rec) => !rec.shown_at)
      .map((rec) => rec.id);
    if (unseenIds.length === 0) return;
    markRecommendationsShown(unseenIds);
  }, [displayedRecommendations]);

  const newRecCount = useMemo(() => {
    if (!lastSeenRefreshTime) return 0;
    return recommendations.filter((rec) => {
      if (!rec.created_at) return false;
      return new Date(rec.created_at) > lastSeenRefreshTime;
    }).length;
  }, [lastSeenRefreshTime, recommendations]);

  const markListViewed = useCallback(async () => {
    const now = new Date();
    try {
      await AsyncStorage.setItem(LAST_SEEN_RECS_KEY, now.toISOString());
      setLastSeenRefreshTime(now);
    } catch (storageError) {
      console.error('Error saving last seen recs time:', storageError);
    }
  }, []);

  useEffect(() => {
    if (loading || recommendations.length === 0) return;
    const timeout = setTimeout(() => {
      markListViewed();
    }, 800);
    return () => clearTimeout(timeout);
  }, [loading, recommendations.length, markListViewed]);

  const handleRefresh = useCallback(async () => {
    if (!user) return;

    setRefreshing(true);
    setError(null);

    try {
      const { error: recError } = await refreshRecommendations();
      if (recError) {
        setError(recError.message);
        return;
      }
      await loadRecommendations(0, false);
    } catch (err) {
      console.error('Error refreshing recommendations:', err);
      setError('Failed to refresh recommendations');
    } finally {
      setRefreshing(false);
    }
  }, [user, loadRecommendations]);
  
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || loading || refreshing) return;
    if (displayCount < recommendations.length) {
      setDisplayCount((prev) => Math.min(prev + 10, recommendations.length));
      return;
    }
    if (!hasMore) return;
    await loadRecommendations(page + 1, true);
  }, [
    loadingMore,
    loading,
    refreshing,
    displayCount,
    recommendations.length,
    hasMore,
    loadRecommendations,
    page,
  ]);

  const handleBookPress = useCallback(async (rec: Recommendation) => {
    if (!rec.book) return;

    markRecommendationClicked(rec.id);

    let bookForDetail = rec.book;
    const needsEnrichment = isBookSparse(rec.book) && Boolean(rec.book.open_library_id);

    if (needsEnrichment) {
      setEnrichingBookId(rec.book_id);
      try {
        const { data: enrichedBook } = await enrichBook(
          rec.book.id,
          rec.book.open_library_id as string
        );
        if (enrichedBook) {
          bookForDetail = enrichedBook;
        }
      } catch (error) {
        console.error('Error enriching book:', error);
      } finally {
        setEnrichingBookId(null);
      }
    }

    try {
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookForDetail.id)
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
      handleApiError(error, 'load book');
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
    if (score < 6.5) {
      return '#E2B34C';
    }
    return '#2FA463';
  };

  const renderBookItem = (rec: Recommendation, _index: number) => {
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
        disabled={enrichingBookId === rec.book_id}
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
          {enrichingBookId === rec.book_id ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
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
            </>
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
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadRecommendations(0, false)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayedRecommendations}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => renderBookItem(item, index)}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            displayedRecommendations.length === 0 && styles.scrollContentEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primaryBlue} />
          }
          ListHeaderComponent={
            showHeader ? (
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text style={styles.title}>Recommendations</Text>
                  {newRecCount > 0 ? (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>
                        {newRecCount} new recommendation{newRecCount === 1 ? '' : 's'}!
                      </Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
                  {refreshing ? (
                    <ActivityIndicator size="small" color={colors.primaryBlue} />
                  ) : (
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No recommendations yet.</Text>
              <Text style={styles.emptySubtext}>
                Keep ranking books to improve your recommendations.
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primaryBlue} />
              </View>
            ) : null
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.6}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
  },
  newBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  newBadgeText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
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
  scrollContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
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
