import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../config/theme';
import { addBookToShelf, checkUserHasBook, removeBookFromShelf } from '../services/books';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';
import { SearchStackParamList } from '../navigation/SearchStackNavigator';

type BookDetailScreenRouteProp = RouteProp<SearchStackParamList, 'BookDetail'>;
type BookDetailScreenNavigationProp = NativeStackNavigationProp<SearchStackParamList, 'BookDetail'>;

export default function BookDetailScreen() {
  const navigation = useNavigation<BookDetailScreenNavigationProp>();
  const route = useRoute<BookDetailScreenRouteProp>();
  const { user } = useAuth();
  const { book } = route.params;

  const [currentStatus, setCurrentStatus] = useState<
    'read' | 'currently_reading' | 'want_to_read' | null
  >(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [animatedIcon, setAnimatedIcon] = useState<string | null>(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const coverUrl = book.cover_url;

  // Check if book already exists in user's shelf
  const refreshBookStatus = React.useCallback(async () => {
    if (!user || (!book.open_library_id && !book.google_books_id)) return;

    try {
      // First, check if book exists in books table
      let existingBook = null;
      if (book.open_library_id) {
        const { data } = await supabase
          .from('books')
          .select('id')
          .eq('open_library_id', book.open_library_id)
          .single();
        existingBook = data;
      }
      
      if (!existingBook && book.google_books_id) {
        const { data } = await supabase
          .from('books')
          .select('id')
          .eq('google_books_id', book.google_books_id)
          .single();
        existingBook = data;
      }

      if (existingBook) {
        const checkResult = await checkUserHasBook(existingBook.id, user.id);
        if (checkResult.exists && checkResult.currentStatus) {
          setCurrentStatus(checkResult.currentStatus as 'read' | 'currently_reading' | 'want_to_read');
        } else {
          setCurrentStatus(null);
        }
      } else {
        setCurrentStatus(null);
      }
    } catch (error) {
      // Book doesn't exist yet, that's fine
      console.log('Book not in shelf yet');
    }
  }, [user, book.open_library_id, book.google_books_id]);

  useEffect(() => {
    refreshBookStatus();
  }, [refreshBookStatus]);

  // Refresh status when returning from BookRanking screen
  useFocusEffect(
    React.useCallback(() => {
      refreshBookStatus();
    }, [refreshBookStatus])
  );

  // Toast animation
  useEffect(() => {
    if (toastMessage) {
      fadeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastMessage(null);
        setAnimatedIcon(null);
      });
    }
  }, [toastMessage, fadeAnim]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'want_to_read': 'Want to Read',
      'currently_reading': 'Currently Reading',
      'read': 'Read',
    };
    return labels[status] || status;
  };

  const handleIconPress = async (status: 'read' | 'currently_reading' | 'want_to_read') => {
    if (!user) {
      setToastMessage('You must be logged in to add books');
      return;
    }

    if (loading) return;

    try {
      setLoading(status);
      setAnimatedIcon(status);
      
      // Check if book is already on this status
      const isCurrentlyOnThisStatus = currentStatus === status;
      
      if (isCurrentlyOnThisStatus) {
        // Remove the book from shelf
        // First, get the book ID from the database
        let existingBook = null;
        if (book.open_library_id) {
          const { data } = await supabase
            .from('books')
            .select('id')
            .eq('open_library_id', book.open_library_id)
            .single();
          existingBook = data;
        }
        
        if (!existingBook && book.google_books_id) {
          const { data } = await supabase
            .from('books')
            .select('id')
            .eq('google_books_id', book.google_books_id)
            .single();
          existingBook = data;
        }

        if (existingBook) {
          const checkResult = await checkUserHasBook(existingBook.id, user.id);
          
          if (checkResult.exists && checkResult.userBookId) {
            // Remove the book
            const { error } = await removeBookFromShelf(checkResult.userBookId);
            
            if (error) {
              throw error;
            }
            
            // Update UI
            setCurrentStatus(null);
            setLoading(null);
            // Removed toast and navigation - no feedback needed for removing from shelf
          } else {
            setToastMessage('Book not found on shelf');
          }
        } else {
          setToastMessage('Book not found');
        }
      } else {
        // Add or move the book
        // If status is 'currently_reading', set started_date to today
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        
        const options = status === 'currently_reading' 
          ? { started_date: todayString }
          : undefined;
        
        const result = await addBookToShelf(book, status, user.id, options);
        
        console.log('=== BookDetailScreen: addBookToShelf result ===');
        console.log('Result:', result);
        console.log('userBookId:', result.userBookId);
        
        if (!result.userBookId || result.userBookId === '') {
          console.error('=== BookDetailScreen: ERROR - Empty userBookId from addBookToShelf ===');
          setToastMessage('Failed to add book - missing book ID');
          setLoading(null);
          return;
        }
        
        const isUpdate = result.isUpdate && currentStatus !== null;
        const isMoving = isUpdate && result.previousStatus !== status;
        
        setCurrentStatus(status);
        
        // Only open ranking screen if status is 'read'
        if (status === 'read') {
          // Navigate to BookRankingScreen after adding the book
          console.log('Navigating to BookRankingScreen with userBookId:', result.userBookId);
          setLoading(null);
          navigation.navigate('BookRanking', {
            book,
            userBookId: result.userBookId,
            initialStatus: status,
            previousStatus: (result.previousStatus as 'read' | 'currently_reading' | 'want_to_read' | undefined) || null,
            wasNewBook: !result.isUpdate,
          });
        } else {
          // For 'currently_reading' or 'want_to_read', just update the UI without opening ranking screen
          setLoading(null);
        }
        
        // Removed toast messages - no feedback needed for adding to shelf
      }
    } catch (error: any) {
      console.error('Error managing book:', error);
      setToastMessage(error.message || 'Failed to update book');
      setLoading(null);
    } finally {
      // Keep animated icon for visual feedback
      setTimeout(() => setAnimatedIcon(null), 800);
    }
  };

  const isIconActive = (status: 'read' | 'currently_reading' | 'want_to_read') => {
    return currentStatus === status;
  };

  const isIconAnimating = (status: 'read' | 'currently_reading' | 'want_to_read') => {
    return animatedIcon === status;
  };

  const metadata = [
    book.average_rating ? `★ ${book.average_rating.toFixed(1)}` : null,
    book.page_count ? `${book.page_count} pages` : null,
    book.published_date ? book.published_date : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      {/* Back Button */}
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Book Cover */}
        {coverUrl && (
          <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="contain" />
        )}

        {/* Title */}
        <Text style={styles.title}>{book.title}</Text>

        {/* Author */}
        <Text style={styles.author}>
          {book.authors?.join(', ') || 'Unknown Author'}
        </Text>

        {/* Quick Action Icons */}
        <View style={styles.actionIconsContainer}>
          {/* Add to Read */}
          <TouchableOpacity
            style={[
              styles.actionIcon,
              isIconActive('read') && styles.actionIconActive,
            ]}
            onPress={() => handleIconPress('read')}
            disabled={Boolean(loading)}
          >
            <Image
              source={require('../../assets/add.png')}
              style={[
                styles.actionIconImage,
                isIconActive('read') && styles.actionIconImageActive,
              ]}
              resizeMode="contain"
            />
          </TouchableOpacity>

          {/* Currently Reading */}
          <TouchableOpacity
            style={[
              styles.actionIcon,
              isIconActive('currently_reading') && styles.actionIconActive,
            ]}
            onPress={() => handleIconPress('currently_reading')}
            disabled={Boolean(loading)}
          >
            <Image
              source={require('../../assets/reading.png')}
              style={[
                styles.actionIconImage,
                isIconActive('currently_reading') && styles.actionIconImageActive,
              ]}
              resizeMode="contain"
            />
          </TouchableOpacity>

          {/* Want to Read */}
          <TouchableOpacity
            style={[
              styles.actionIcon,
              isIconActive('want_to_read') && styles.actionIconActive,
            ]}
            onPress={() => handleIconPress('want_to_read')}
            disabled={Boolean(loading)}
          >
            <Image
              source={require('../../assets/bookmark.png')}
              style={[
                styles.actionIconImage,
                isIconActive('want_to_read') && styles.actionIconImageActive,
              ]}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {/* Metadata */}
        {metadata && (
          <Text style={styles.metadata}>{metadata}</Text>
        )}

        {/* Categories */}
        {book.categories && book.categories.length > 0 && (
          <View style={styles.categoriesContainer}>
            {book.categories.map((category: string, index: number) => (
              <View key={index} style={styles.categoryChip}>
                <Text style={styles.categoryText}>{category}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        {book.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionLabel}>Description</Text>
            <Text style={styles.description}>{book.description}</Text>
          </View>
        )}

        {/* Additional Info */}
        <View style={styles.infoSection}>
          {book.publisher && (
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Publisher: </Text>
              {book.publisher}
            </Text>
          )}
          {book.language && (
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Language: </Text>
              {book.language.toUpperCase()}
            </Text>
          )}
          {book.isbn_10 && (
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>ISBN-10: </Text>
              {book.isbn_10}
            </Text>
          )}
          {book.isbn_13 && (
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>ISBN-13: </Text>
              {book.isbn_13}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Toast Message */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: {
    marginTop: Platform.OS === 'ios' ? 8 : 16,
    marginLeft: 16,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 80,
    paddingBottom: 100,
    paddingHorizontal: 24,
  },
  coverImage: {
    width: 200,
    aspectRatio: 2/3,
    borderRadius: 8,
    marginBottom: 24,
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    marginBottom: 8,
    textAlign: 'center',
  },
  author: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 24,
    textAlign: 'center',
  },
  actionIconsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.primaryBlue,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconActive: {
    backgroundColor: colors.primaryBlue,
  },
  actionIconText: {
    fontSize: 24,
    color: colors.brownText,
  },
  actionIconTextActive: {
    color: colors.white,
  },
  actionIconImage: {
    width: 24,
    height: 24,
    tintColor: colors.brownText,
  },
  actionIconImageActive: {
    tintColor: colors.white,
  },
  metadata: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 16,
    textAlign: 'center',
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 24,
    marginRight: -8,
  },
  categoryChip: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
  },
  descriptionSection: {
    marginBottom: 24,
  },
  descriptionLabel: {
    fontSize: 20,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    fontFamily: typography.body,
    color: colors.brownText,
    lineHeight: 24,
    opacity: 0.9,
  },
  infoSection: {
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 8,
    opacity: 0.8,
  },
  infoLabel: {
    fontWeight: '600',
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    backgroundColor: colors.brownText,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    color: colors.white,
    fontFamily: typography.body,
    fontSize: 16,
    fontWeight: '500',
  },
});
