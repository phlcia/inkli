import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useErrorHandler } from '../../../contexts/ErrorHandlerContext';
import { getUserBooks, UserBook, removeCustomLabelFromAllBooks } from '../../../services/books';
import { getScoreColor, formatScore } from '../../../utils/rankScoreColors';
import { supabase } from '../../../config/supabase';
import { YourShelfStackParamList } from '../../../navigation/YourShelfStackNavigator';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import FilterPanel from '../../../components/filters/FilterPanel';
import { filterBooks, groupBooksByShelf, getFilteredBookCounts } from '../../../utils/bookFilters';
import { trackFilterApplied, trackFilterCleared, trackCustomLabelDeleted, ShelfContext } from '../../../services/analytics';
import RecommendationsList from '../../recommendations/components/RecommendationsList';
import FriendsLikedList from '../../recommendations/components/FriendsLikedList';

type ShelfTab = 'read' | 'currently_reading' | 'want_to_read' | 'recommended' | 'friends_liked';
type ShelfScreenProps = {
  ownerUserId: string;
  headerTitle: string;
  initialTab?: ShelfTab;
  refreshKey?: number;
};

type ShelfNavigationProp =
  | NativeStackNavigationProp<YourShelfStackParamList>
  | NativeStackNavigationProp<SearchStackParamList, 'UserShelf'>;

export default function ShelfScreen({
  ownerUserId,
  headerTitle,
  initialTab,
  refreshKey,
}: ShelfScreenProps) {
  const { user: currentUser } = useAuth();
  const { handleApiError } = useErrorHandler();
  const navigation = useNavigation<ShelfNavigationProp>();
  const [books, setBooks] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ShelfTab>(initialTab || 'read');
  
  // Filter state
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedCustomLabels, setSelectedCustomLabels] = useState<string[]>([]);
  const [customLabelSuggestions, setCustomLabelSuggestions] = useState<string[]>([]);
  const canShowRecommendations = Boolean(currentUser?.id && currentUser.id === ownerUserId);

  const loadBooks = useCallback(async (showLoading = true) => {
    if (!ownerUserId) {
      if (showLoading) {
        setLoading(false);
      }
      return;
    }

    try {
      if (showLoading) {
        setLoading(true);
      }
      const userBooks = await getUserBooks(ownerUserId);
      setBooks(userBooks);
      
      // Extract unique custom labels from user's books for auto-complete suggestions
      const allLabels = new Set<string>();
      userBooks.forEach((book) => {
        if (book.custom_labels && book.custom_labels.length > 0) {
          book.custom_labels.forEach((label) => allLabels.add(label));
        }
      });
      setCustomLabelSuggestions(Array.from(allLabels).sort());
    } catch (error) {
      handleApiError(error, 'load shelf', () => loadBooks(showLoading));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [ownerUserId, handleApiError]);

  useFocusEffect(
    useCallback(() => {
      loadBooks();
    }, [loadBooks])
  );

  useEffect(() => {
    if (refreshKey !== undefined) {
      loadBooks();
    }
  }, [refreshKey, loadBooks]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBooks(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadBooks]);

  useEffect(() => {
    if (initialTab) {
      const validTab = ['read', 'currently_reading', 'want_to_read', 'recommended', 'friends_liked'].includes(initialTab)
        ? initialTab
        : 'read';
      if ((validTab === 'recommended' || validTab === 'friends_liked') && !canShowRecommendations) {
        setActiveTab('read');
      } else {
        setActiveTab(validTab);
      }
    }
  }, [initialTab, canShowRecommendations]);

  const shelfContextForFilters: ShelfContext =
    activeTab === 'read' || activeTab === 'currently_reading' || activeTab === 'want_to_read'
      ? activeTab
      : 'read';

  // Apply filters to all books (across all shelves)
  const filteredBooks = useMemo(() => {
    return filterBooks(books, selectedGenres, selectedCustomLabels);
  }, [books, selectedGenres, selectedCustomLabels]);

  // Group filtered books by shelf
  const groupedBooks = useMemo(() => {
    return groupBooksByShelf(filteredBooks);
  }, [filteredBooks]);

  // Get books for current active tab
  const booksForCurrentTab = useMemo(() => {
    return groupedBooks[activeTab] || [];
  }, [groupedBooks, activeTab]);

  // Get filtered counts
  const filteredCounts = useMemo(() => {
    return getFilteredBookCounts(books, selectedGenres, selectedCustomLabels);
  }, [books, selectedGenres, selectedCustomLabels]);

  // Sort books for current tab
  const sortedBooks = useMemo(() => {
    const tabBooks = booksForCurrentTab;
    if (activeTab === 'read') {
      return [...tabBooks].sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
    } else if (activeTab === 'currently_reading') {
      return [...tabBooks].sort((a, b) => {
        const aValue = a.last_progress_update || a.updated_at || '';
        const bValue = b.last_progress_update || b.updated_at || '';
        const aTime = aValue ? new Date(aValue).getTime() : 0;
        const bTime = bValue ? new Date(bValue).getTime() : 0;
        return bTime - aTime;
      });
    } else {
      return [...tabBooks].sort((a, b) => {
        const titleA = a.book?.title || '';
        const titleB = b.book?.title || '';
        return titleA.localeCompare(titleB);
      });
    }
  }, [booksForCurrentTab, activeTab]);

  const hasActiveFilters = selectedGenres.length > 0 || selectedCustomLabels.length > 0;
  const isOwnerViewing = Boolean(currentUser?.id && currentUser.id === ownerUserId);

  const handleFiltersChange = useCallback((genres: string[], customLabels: string[]) => {
    setSelectedGenres(genres);
    setSelectedCustomLabels(customLabels);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedGenres([]);
    setSelectedCustomLabels([]);
  }, []);

  const handleTrackFilterApplied = useCallback((genres: string[], customLabels: string[], resultCount: number) => {
    if (!currentUser?.id) return;
    trackFilterApplied(genres, customLabels, shelfContextForFilters, resultCount, currentUser.id);
  }, [currentUser?.id, shelfContextForFilters]);

  const handleTrackFilterCleared = useCallback(() => {
    if (!currentUser?.id) return;
    trackFilterCleared(shelfContextForFilters, currentUser.id);
  }, [currentUser?.id, shelfContextForFilters]);

  const handleDeleteCustomLabel = useCallback(async (label: string) => {
    if (!currentUser?.id) return;

    try {
      const affectedCount = await removeCustomLabelFromAllBooks(currentUser.id, label);

      // Clear from active filters if currently selected
      setSelectedCustomLabels((prev) => prev.filter((l) => l !== label));

      // Refresh books to update suggestions and counts
      await loadBooks();

      // Track analytics
      await trackCustomLabelDeleted(label, affectedCount, 'filter_panel', currentUser.id);

    } catch (error) {
      handleApiError(error, 'delete shelf');
      throw error; // Re-throw so FilterPanel can handle UI state
    }
  }, [currentUser?.id, loadBooks, handleApiError]);

  const handleBookPress = async (userBook: UserBook) => {
    if (!userBook.book) return;

    try {
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', userBook.book_id)
        .single();

      if (error) throw error;

      let userBookData = null;
      if (currentUser?.id) {
        const { data } = await supabase
          .from('user_books')
          .select('*')
          .eq('user_id', currentUser.id)
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
  };

  const renderBookItem = (book: UserBook, rankNumber: number) => {
    const bookData = book.book;
    if (!bookData) return null;

    const score = book.rank_score || 0;
    const scoreColor = getScoreColor(score);
    const progressPercent = book.progress_percent ?? 0;

    return (
      <TouchableOpacity
        key={book.id}
        style={styles.bookItem}
        activeOpacity={0.7}
        onPress={() => handleBookPress(book)}
      >
        <Text style={styles.rankNumber}>{rankNumber}.</Text>
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
          {activeTab === 'currently_reading' && (
            <View style={styles.progressRow}>
              <Text style={styles.progressPercent}>{progressPercent}%</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progressPercent}%` }]}
                />
              </View>
            </View>
          )}
        </View>

        {activeTab === 'read' && book.rank_score !== null && (
          <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
            <Text style={styles.scoreText}>{formatScore(score)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const getEmptyStateMessage = () => {
    if (hasActiveFilters) {
      // Filtered empty state - contextual messaging
      const genreText = selectedGenres.length > 0 ? selectedGenres.join(', ') : '';
      const labelText = selectedCustomLabels.length > 0 ? selectedCustomLabels[0] : '';
      
      let title = '';
      if (genreText && labelText) {
        title = `No books match "${genreText}" + "${labelText}" on your ${activeTab === 'read' ? 'Read' : activeTab === 'currently_reading' ? 'Currently Reading' : 'Want to Read'} shelf.`;
      } else if (genreText) {
        title = `No ${genreText} books on your ${activeTab === 'read' ? 'Read' : activeTab === 'currently_reading' ? 'Currently Reading' : 'Want to Read'} shelf yet.`;
      } else if (labelText) {
        title = `No books tagged with "${labelText}" on your ${activeTab === 'read' ? 'Read' : activeTab === 'currently_reading' ? 'Currently Reading' : 'Want to Read'} shelf.`;
      }
      
      return {
        title,
        subtitle: 'Try a different filter or add more books!',
      };
    }
    
    // Normal empty state
    switch (activeTab) {
      case 'read':
        return {
          title: 'No books yet...',
          subtitle: 'Ranked books will show up here.',
        };
      case 'currently_reading':
        return {
          title: 'No books yet...',
          subtitle: 'Currently-reading books will show up here.',
        };
      case 'want_to_read':
        return {
          title: 'No books yet...',
          subtitle: 'Want-to-read books will show up here.',
        };
      case 'recommended':
        return {
          title: 'No recommendations yet...',
          subtitle: 'Keep ranking books to improve your recommendations!',
        };
      case 'friends_liked':
        return {
          title: 'No friend activity yet...',
          subtitle: 'Follow more friends to see what they like.',
        };
    }
  };

  const emptyState = getEmptyStateMessage();

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{headerTitle}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{headerTitle}</Text>
        </View>
        <View style={styles.headerRight}>
          {activeTab === 'read' && isOwnerViewing && (
            <TouchableOpacity
              style={[styles.reorderButton, hasActiveFilters && styles.reorderButtonDisabled]}
              onPress={() => {
                if (hasActiveFilters) {
                  Alert.alert('Clear filters to reorder', 'Reordering is only available without filters.');
                  return;
                }
                (navigation as NativeStackNavigationProp<YourShelfStackParamList>).navigate('ReorderShelf');
              }}
            >
              <Text style={styles.reorderButtonText}>Reorder</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'read' && (
            <TouchableOpacity
              style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
              onPress={() => setFilterPanelVisible(true)}
            >
              <Text style={[styles.filterButtonText, hasActiveFilters && styles.filterButtonTextActive]}>
                Filter
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('read')}>
          <Text style={[styles.tabText, activeTab === 'read' && styles.tabTextActive]}>
            Read
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('currently_reading')}>
          <Text style={[styles.tabText, activeTab === 'currently_reading' && styles.tabTextActive]}>
            Currently Reading
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('want_to_read')}>
          <Text style={[styles.tabText, activeTab === 'want_to_read' && styles.tabTextActive]}>
            Want to Read
          </Text>
        </TouchableOpacity>
        {canShowRecommendations && (
          <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('recommended')}>
            <Text style={[styles.tabText, activeTab === 'recommended' && styles.tabTextActive]}>
              Recommended for You
            </Text>
          </TouchableOpacity>
        )}
        {canShowRecommendations && (
          <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('friends_liked')}>
            <Text style={[styles.tabText, activeTab === 'friends_liked' && styles.tabTextActive]}>
              From Your Friends
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.separator} />

      {activeTab === 'recommended' && canShowRecommendations ? (
        <RecommendationsList showHeader={false} />
      ) : activeTab === 'friends_liked' && canShowRecommendations && currentUser?.id ? (
        <FriendsLikedList showHeader={false} userId={currentUser.id} />
      ) : sortedBooks.length === 0 ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, styles.emptyContainer]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primaryBlue}
            />
          }
        >
          <Text style={styles.emptyText}>{emptyState.title}</Text>
          <Text style={styles.emptySubtext}>{emptyState.subtitle}</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primaryBlue}
            />
          }
        >
          {sortedBooks.map((book, index) => renderBookItem(book, index + 1))}
        </ScrollView>
      )}

      {/* Filter Panel */}
      <FilterPanel
        visible={filterPanelVisible}
        onClose={() => setFilterPanelVisible(false)}
        selectedGenres={selectedGenres}
        selectedCustomLabels={selectedCustomLabels}
        onFiltersChange={handleFiltersChange}
        resultCount={filteredCounts.total}
        shelfContext={shelfContextForFilters}
        customLabelSuggestions={customLabelSuggestions}
        onClearFilters={handleClearFilters}
        onTrackFilterApplied={handleTrackFilterApplied}
        onTrackFilterCleared={handleTrackFilterCleared}
        onDeleteCustomLabel={handleDeleteCustomLabel}
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
  titleContainer: {
    flex: 1,
    flexShrink: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 16,
  },
  tabScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tab: {
    alignItems: 'flex-start',
  },
  tabText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '400',
    opacity: 0.7,
  },
  tabTextActive: {
    fontWeight: '700',
    opacity: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.brownText,
    opacity: 0.2,
    marginHorizontal: 16,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
    alignItems: 'center',
  },
  reorderButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue,
    borderWidth: 1,
    borderColor: colors.brownText + '40',
  },
  reorderButtonDisabled: {
    opacity: 0.5,
  },
  reorderButtonText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue,
    borderWidth: 1,
    borderColor: colors.brownText + '40',
  },
  filterButtonActive: {
    backgroundColor: colors.primaryBlue,
    borderColor: colors.primaryBlue,
  },
  filterButtonText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
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
  rankNumber: {
    fontSize: 24,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '700',
    width: 40,
    marginRight: 12,
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
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  progressPercent: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 32,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#E2E2E2',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 6,
    backgroundColor: colors.primaryBlue,
  },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  scoreText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '700',
  },
});
