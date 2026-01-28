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
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserBooks, UserBook, removeCustomLabelFromAllBooks, updateTierScoresBatch } from '../../../services/books';
import { getScoreColor, formatScore } from '../../../utils/rankScoreColors';
import { supabase } from '../../../config/supabase';
import { YourShelfStackParamList } from '../../../navigation/YourShelfStackNavigator';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import FilterPanel from '../../../components/filters/FilterPanel';
import { filterBooks, groupBooksByShelf, getFilteredBookCounts } from '../../../utils/bookFilters';
import { trackFilterApplied, trackFilterCleared, trackCustomLabelDeleted, ShelfContext } from '../../../services/analytics';
import RecommendationsList from '../../recommendations/components/RecommendationsList';

type ShelfTab = 'read' | 'currently_reading' | 'want_to_read' | 'recommended';
type RatingTier = 'liked' | 'fine' | 'disliked';

type ShelfScreenProps = {
  ownerUserId: string;
  headerTitle: string;
  initialTab?: ShelfTab;
  refreshKey?: number;
};

type ShelfNavigationProp =
  | NativeStackNavigationProp<YourShelfStackParamList, 'YourShelfMain'>
  | NativeStackNavigationProp<SearchStackParamList, 'UserShelf'>;

export default function ShelfScreen({
  ownerUserId,
  headerTitle,
  initialTab,
  refreshKey,
}: ShelfScreenProps) {
  const { user: currentUser } = useAuth();
  const navigation = useNavigation<ShelfNavigationProp>();
  const [books, setBooks] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ShelfTab>(initialTab || 'read');
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isSavingReorder, setIsSavingReorder] = useState(false);
  const [reorderBooks, setReorderBooks] = useState<{
    liked: UserBook[];
    fine: UserBook[];
    disliked: UserBook[];
  } | null>(null);
  
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
      
      // DEBUG: Log book data to verify genres are loaded
      console.log('=== ShelfScreen loadBooks DEBUG ===');
      console.log('Loaded', userBooks.length, 'books');
      if (userBooks.length > 0) {
        const firstBook = userBooks[0];
        console.log('Sample book:', {
          title: firstBook?.book?.title,
          genres: firstBook?.book?.genres,
          custom_labels: firstBook?.custom_labels,
        });
        
        // Count data availability
        const withGenres = userBooks.filter(b => (b.book?.genres?.length ?? 0) > 0).length;
        const withLabels = userBooks.filter(b => (b.custom_labels?.length ?? 0) > 0).length;
        console.log('Books with genres:', withGenres, '/', userBooks.length);
        console.log('Books with custom_labels:', withLabels, '/', userBooks.length);
        
        // List all unique genres and labels found
        const allGenres = new Set<string>();
        const allLabelsSet = new Set<string>();
        userBooks.forEach((book) => {
          book.book?.genres?.forEach(g => allGenres.add(g));
          book.custom_labels?.forEach(l => allLabelsSet.add(l));
        });
        console.log('All genres found:', Array.from(allGenres));
        console.log('All custom_labels found:', Array.from(allLabelsSet));
      }
      
      // Extract unique custom labels from user's books for auto-complete suggestions
      const allLabels = new Set<string>();
      userBooks.forEach((book) => {
        if (book.custom_labels && book.custom_labels.length > 0) {
          book.custom_labels.forEach((label) => allLabels.add(label));
        }
      });
      setCustomLabelSuggestions(Array.from(allLabels).sort());
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [ownerUserId]);

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
      const validTab = ['read', 'currently_reading', 'want_to_read', 'recommended'].includes(initialTab)
        ? initialTab
        : 'read';
      setActiveTab(validTab === 'recommended' && !canShowRecommendations ? 'read' : validTab);
    }
  }, [initialTab, canShowRecommendations]);

  useEffect(() => {
    if (activeTab !== 'read' && isReorderMode) {
      setIsReorderMode(false);
      setReorderBooks(null);
    }
  }, [activeTab, isReorderMode]);

  const shelfContextForFilters: ShelfContext =
    activeTab === 'read' || activeTab === 'currently_reading' || activeTab === 'want_to_read'
      ? activeTab
      : 'read';

  const splitReadBooksByRating = useCallback((readBooks: UserBook[]) => {
    const tiers = { liked: [] as UserBook[], fine: [] as UserBook[], disliked: [] as UserBook[] };
    readBooks.forEach((book) => {
      if (book.rating === 'liked') tiers.liked.push(book);
      else if (book.rating === 'fine') tiers.fine.push(book);
      else if (book.rating === 'disliked') tiers.disliked.push(book);
    });
    return tiers;
  }, []);

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
  const canReorder = activeTab === 'read' && isOwnerViewing && !hasActiveFilters && !loading;

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

      console.log(`Removed "${label}" from ${affectedCount} books`);
    } catch (error) {
      console.error('Error deleting custom label:', error);
      throw error; // Re-throw so FilterPanel can show error alert
    }
  }, [currentUser?.id, loadBooks]);

  const handleStartReorder = useCallback(() => {
    if (!canReorder) {
      if (hasActiveFilters) {
        Alert.alert('Clear filters to reorder', 'Reordering is only available without filters.');
      }
      return;
    }
    setFilterPanelVisible(false);
    const snapshot = splitReadBooksByRating(booksForCurrentTab);
    setReorderBooks(snapshot);
    setIsReorderMode(true);
  }, [canReorder, hasActiveFilters, splitReadBooksByRating, booksForCurrentTab]);

  const handleCancelReorder = useCallback(() => {
    setIsReorderMode(false);
    setReorderBooks(null);
  }, []);

  const roundScore = (score: number): number => Math.round(score * 1000) / 1000;

  const computeTierScores = useCallback((tier: RatingTier, tierBooks: UserBook[]) => {
    const TIER_BOUNDARIES = {
      disliked: { min: 0, max: 3.5 },
      fine: { min: 3.5, max: 6.5 },
      liked: { min: 6.5, max: 10.0 },
    } as const;

    const { min, max } = TIER_BOUNDARIES[tier];
    const count = tierBooks.length;
    if (count === 0) return [];
    const range = max - min;

    return tierBooks.map((book, index) => ({
      id: book.id,
      score: roundScore(range * (count - index) / count + min),
    }));
  }, []);

  const handleSaveReorder = useCallback(async () => {
    if (!currentUser?.id || !reorderBooks) {
      handleCancelReorder();
      return;
    }

    setIsSavingReorder(true);
    try {
      const tiers: RatingTier[] = ['liked', 'fine', 'disliked'];
      for (const tier of tiers) {
        const updatedBooks = computeTierScores(tier, reorderBooks[tier]);
        if (updatedBooks.length > 0) {
          await updateTierScoresBatch(currentUser.id, tier, updatedBooks, { touchUpdatedAt: false });
        }
      }
    } catch (error) {
      console.error('Error saving reorder:', error);
      Alert.alert('Failed to save order', 'Your changes were not saved. Please try again.');
    } finally {
      setIsSavingReorder(false);
      setIsReorderMode(false);
      setReorderBooks(null);
      await loadBooks();
    }
  }, [currentUser?.id, reorderBooks, computeTierScores, loadBooks, handleCancelReorder]);

  const handleTierDragEnd = useCallback((tier: RatingTier, newData: UserBook[]) => {
    setReorderBooks((prev) => (prev ? { ...prev, [tier]: newData } : prev));
  }, []);

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
      console.error('Error loading book details:', error);
      Alert.alert('Error', 'Could not load book details');
    }
  };

  const handleTabPress = useCallback((tab: ShelfTab) => {
    if (isReorderMode) return;
    setActiveTab(tab);
  }, [isReorderMode]);

  const renderBookItem = (book: UserBook, rankNumber: number) => {
    const bookData = book.book;
    if (!bookData) return null;

    const score = book.rank_score || 0;
    const scoreColor = getScoreColor(score);

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
        </View>

        {activeTab === 'read' && book.rank_score !== null && (
          <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
            <Text style={styles.scoreText}>{formatScore(score)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderReorderItem = useCallback(
    ({ item, index, drag, isActive }: RenderItemParams<UserBook>) => {
      const bookData = item.book;
      if (!bookData) return null;

      const score = item.rank_score || 0;
      const scoreColor = getScoreColor(score);

      return (
        <View style={[styles.bookItem, isActive && styles.bookItemActive]}>
          <TouchableOpacity
            style={styles.dragHandle}
            onLongPress={drag}
            disabled={isSavingReorder}
            activeOpacity={0.6}
          >
            <Text style={styles.dragHandleText}>≡</Text>
          </TouchableOpacity>
          <Text style={styles.rankNumber}>{index + 1}.</Text>
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

          {item.rank_score !== null && (
            <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
              <Text style={styles.scoreText}>{formatScore(score)}</Text>
            </View>
          )}
        </View>
      );
    },
    [isSavingReorder]
  );

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
    }
  };

  const emptyState = getEmptyStateMessage();
  const tierTitles: Record<RatingTier, string> = {
    liked: 'Liked',
    fine: 'Fine',
    disliked: 'Disliked',
  };
  const tieredReadBooks = reorderBooks ?? splitReadBooksByRating(booksForCurrentTab);

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
          {activeTab === 'read' && isOwnerViewing && !isReorderMode && (
            <TouchableOpacity
              style={[styles.reorderButton, hasActiveFilters && styles.reorderButtonDisabled]}
              onPress={handleStartReorder}
            >
              <Text style={styles.reorderButtonText}>
                Reorder
              </Text>
            </TouchableOpacity>
          )}
          {activeTab === 'read' && isOwnerViewing && isReorderMode && (
            <TouchableOpacity
              style={[styles.reorderButton, isSavingReorder && styles.reorderButtonDisabled]}
              onPress={handleSaveReorder}
              disabled={isSavingReorder}
            >
              <Text style={styles.reorderButtonText}>
                {isSavingReorder ? 'Saving...' : 'Done'}
              </Text>
            </TouchableOpacity>
          )}
          {activeTab === 'read' && !isReorderMode && (
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
        <TouchableOpacity style={styles.tab} onPress={() => handleTabPress('read')}>
          <Text style={[styles.tabText, activeTab === 'read' && styles.tabTextActive]}>
            Read
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => handleTabPress('currently_reading')}>
          <Text style={[styles.tabText, activeTab === 'currently_reading' && styles.tabTextActive]}>
            Currently Reading
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => handleTabPress('want_to_read')}>
          <Text style={[styles.tabText, activeTab === 'want_to_read' && styles.tabTextActive]}>
            Want to Read
          </Text>
        </TouchableOpacity>
        {canShowRecommendations && (
          <TouchableOpacity style={styles.tab} onPress={() => handleTabPress('recommended')}>
            <Text style={[styles.tabText, activeTab === 'recommended' && styles.tabTextActive]}>
              Recommended
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.separator} />

      {activeTab === 'recommended' && canShowRecommendations ? (
        <RecommendationsList showHeader={false} />
      ) : activeTab === 'read' && isReorderMode ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {(Object.keys(tierTitles) as RatingTier[]).map((tier) => {
            const tierBooks = tieredReadBooks[tier];
            if (!tierBooks || tierBooks.length === 0) return null;
            return (
              <View key={tier} style={styles.tierSection}>
                <Text style={styles.tierTitle}>{tierTitles[tier]}</Text>
                <DraggableFlatList
                  data={tierBooks}
                  onDragEnd={({ data }) => handleTierDragEnd(tier, data)}
                  keyExtractor={(item) => item.id}
                  renderItem={renderReorderItem}
                  scrollEnabled={false}
                />
              </View>
            );
          })}
        </ScrollView>
      ) : sortedBooks.length === 0 ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, styles.emptyContainer]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            !isReorderMode ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primaryBlue}
              />
            ) : undefined
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
            !isReorderMode ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primaryBlue}
              />
            ) : undefined
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
    gap: 16,
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
  tierSection: {
    marginBottom: 20,
  },
  tierTitle: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  bookItemActive: {
    opacity: 0.8,
  },
  dragHandle: {
    marginRight: 8,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  dragHandleText: {
    fontSize: 18,
    color: '#999',
    fontFamily: typography.body,
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
