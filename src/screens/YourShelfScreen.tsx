import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../config/theme';
import { useAuth } from '../contexts/AuthContext';
import { getUserBooks, UserBook } from '../services/books';
import { getScoreColor, formatScore } from '../utils/rankScoreColors';
import { supabase } from '../config/supabase';
import { YourShelfStackParamList } from '../navigation/YourShelfStackNavigator';

type YourShelfScreenNavigationProp = NativeStackNavigationProp<YourShelfStackParamList, 'YourShelfMain'>;

export default function YourShelfScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<YourShelfScreenNavigationProp>();
  const route = useRoute();
  const [books, setBooks] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'read' | 'currently_reading' | 'want_to_read'>('read');

  const loadBooks = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const userBooks = await getUserBooks(user.id);
      setBooks(userBooks);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      console.log('=== YourShelfScreen: useFocusEffect - loading books ===');
      loadBooks();
    }, [user])
  );

  // Listen for route params changes (triggered when ranking completes)
  React.useEffect(() => {
    const params = (route.params as any);
    if (params?.refresh) {
      console.log('=== YourShelfScreen: Refresh triggered by route param ===');
      loadBooks();
      // Clear the param to avoid repeated refreshes
      (navigation as any).setParams({ refresh: undefined });
    }
  }, [route.params, navigation, user]);

  // Handle route params to set initial tab (from ProfileScreen shelf cards)
  React.useEffect(() => {
    const params = (route.params as any);
    if (params?.initialTab) {
      const validTab = ['read', 'currently_reading', 'want_to_read'].includes(params.initialTab)
        ? params.initialTab
        : 'read';
      setActiveTab(validTab);
      // Clear the param to avoid repeated switches
      (navigation as any).setParams({ initialTab: undefined });
    }
  }, [route.params, navigation]);

  // Filter books by active tab status
  const filteredBooks = books.filter((book) => book.status === activeTab);

  // Sort books based on active tab
  let sortedBooks: UserBook[];
  if (activeTab === 'read') {
    // Read books: sort by rank_score descending
    sortedBooks = [...filteredBooks].sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
  } else {
    // Currently Reading and Want to Read: sort alphabetically by title
    sortedBooks = [...filteredBooks].sort((a, b) => {
      const titleA = a.book?.title || '';
      const titleB = b.book?.title || '';
      return titleA.localeCompare(titleB);
    });
  }

  const handleBookPress = async (userBook: UserBook) => {
    if (!user || !userBook.book) return;

    try {
      // Fetch full book details from database
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', userBook.book_id)
        .single();

      if (error) throw error;

      // Check if user already has this book
      const { data: userBookData } = await supabase
        .from('user_books')
        .select('*')
        .eq('user_id', user.id)
        .eq('book_id', fullBook.id)
        .single();

      // Navigate to BookDetailScreen with book data
      navigation.navigate('BookDetail', {
        book: {
          ...fullBook,
          userBook: userBookData || null, // Include user's status, rating, etc.
        },
      });
    } catch (error) {
      console.error('Error loading book details:', error);
      Alert.alert('Error', 'Could not load book details');
    }
  };

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
        {/* Rank Number */}
        <Text style={styles.rankNumber}>{rankNumber}.</Text>

        {/* Book Info */}
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

        {/* Score Circle - only show for Read books */}
        {activeTab === 'read' && book.rank_score !== null && (
          <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
            <Text style={styles.scoreText}>{formatScore(score)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const getEmptyStateMessage = () => {
    switch (activeTab) {
      case 'read':
        return {
          title: 'No books yet...',
          subtitle: 'Rank your books to see them here!',
        };
      case 'currently_reading':
        return {
          title: 'No books yet...',
          subtitle: 'Add books to your currently-reading list!',
        };
      case 'want_to_read':
        return {
          title: 'No books yet...',
          subtitle: 'Add books to your want-to-read list!',
        };
    }
  };

  const emptyState = getEmptyStateMessage();

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>My Shelf</Text>
          </View>
          <View style={styles.headerRight}>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Your Shelf</Text>
        </View>
        <View style={styles.headerRight}>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('read')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'read' && styles.tabTextActive,
            ]}
          >
            Read
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('currently_reading')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'currently_reading' && styles.tabTextActive,
            ]}
          >
            Currently Reading
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('want_to_read')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'want_to_read' && styles.tabTextActive,
            ]}
          >
            Want to Read
          </Text>
        </TouchableOpacity>
      </View>

      {/* Separator Line */}
      <View style={styles.separator} />

      {sortedBooks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyState.title}</Text>
          <Text style={styles.emptySubtext}>{emptyState.subtitle}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sortedBooks.map((book, index) => renderBookItem(book, index + 1))}
        </ScrollView>
      )}
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
    paddingTop: 8,
    paddingBottom: 4,
    gap: 16,
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
  },
  headerIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
    color: colors.brownText,
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
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 8,
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
