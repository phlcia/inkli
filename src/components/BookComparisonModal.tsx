import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors, typography } from '../config/theme';
import { UserBook, getUserBooksByRating, updateBookRankScore } from '../services/books';
import { useAuth } from '../contexts/AuthContext';
import { useBookRanking } from '../hooks/useBookRanking';
import { RankedBook } from '../utils/bookRanking';
import { supabase } from '../config/supabase';

interface BookComparisonModalProps {
  visible: boolean;
  currentBook: {
    id: string;
    title: string;
    authors?: string[];
    cover_url?: string | null;
  };
  rating: 'liked' | 'fine' | 'disliked';
  onClose: () => void;
  onComplete: () => void;
}

/**
 * Convert UserBook to RankedBook format
 * Uses rank_score directly from database
 */
function userBookToRankedBook(userBook: UserBook): RankedBook {
  return {
    id: userBook.id,
    title: userBook.book?.title || 'Unknown',
    authors: userBook.book?.authors || [],
    cover_url: userBook.book?.cover_url || null,
    score: userBook.rank_score || 0, // Use rank_score directly
  };
}

export default function BookComparisonModal({
  visible,
  currentBook,
  rating,
  onClose,
  onComplete,
}: BookComparisonModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showRankedConfirmation, setShowRankedConfirmation] = useState(false);
  const [existingBooks, setExistingBooks] = useState<RankedBook[]>([]);
  const [shouldStartInsertion, setShouldStartInsertion] = useState(false);

  // Initialize ranking hook with empty array (will be populated when we load books)
  const ranking = useBookRanking([]);

  // Start insertion after reset completes (when shouldStartInsertion is set to true)
  useEffect(() => {
    if (shouldStartInsertion) {
      console.log('Starting insertion after reset for book:', currentBook.id);
      ranking.startInserting({
        id: currentBook.id,
        title: currentBook.title,
        authors: currentBook.authors || [],
        cover_url: currentBook.cover_url || null,
      }, rating);
      setShouldStartInsertion(false);
      console.log('Insertion started - waiting for user comparisons');
    }
  }, [shouldStartInsertion, currentBook, rating, ranking]);

  // Load existing liked books and initialize ranking
  useEffect(() => {
    if (visible && user) {
      // Reset state when modal becomes visible
      setShouldStartInsertion(false);
      loadExistingBooks();
    } else if (!visible) {
      // Reset state when modal is hidden
      setShouldStartInsertion(false);
      setExistingBooks([]);
    }
  }, [visible, user]);

  const loadExistingBooks = async () => {
    if (!user) return;

    try {
      console.log('=== RANKING DEBUG: loadExistingBooks ===');
      console.log('Current book ID:', currentBook.id);
      console.log('Rating category:', rating);
      setLoading(true);
      // Get all books in the same rating category
      const categoryBooks = await getUserBooksByRating(user.id, rating);
      console.log('All books in category:', categoryBooks.length);
      
      // Filter out the current book (it's being added)
      const otherBooks = categoryBooks.filter((book) => book.id !== currentBook.id);
      console.log('Other books (excluding current):', otherBooks.length);
      
      // Convert to RankedBook format (only books with rank_score)
      const rankedBooks = otherBooks
        .filter((book) => book.rank_score !== null)
        .map(userBookToRankedBook);
      console.log('Ranked books (with rank_score):', rankedBooks.length);
      console.log('Ranked books details:', rankedBooks.map(b => ({ id: b.id, title: b.title, score: b.score })));
      
      // If no existing books, this is the first in category
      // It should already have default score from updateUserBookDetails
      // But if it doesn't, set it now
      if (rankedBooks.length === 0) {
        console.log('No existing ranked books - this is first in category');
        console.log('Checking if book already has default score...');
        // Check if book already has a score
        const currentBookData = categoryBooks.find(b => b.id === currentBook.id);
        if (currentBookData?.rank_score) {
          console.log('Book already has rank_score:', currentBookData.rank_score);
          setShowRankedConfirmation(true);
          setTimeout(() => {
            setShowRankedConfirmation(false);
            onComplete();
          }, 1500);
        } else {
          console.log('=== RANKING DEBUG: Book does NOT have rank_score - setting default score now ===');
          // Set default score for first book in category
          setProcessing(true);
          try {
            const { getDefaultScoreForRating } = await import('../utils/bookRanking');
            const defaultScore = getDefaultScoreForRating(rating);
            
            console.log('=== RANKING DEBUG: Setting default score ===');
            console.log('Book ID:', currentBook.id);
            console.log('Rating:', rating);
            console.log('Default score:', defaultScore);
            
            // Update the book with default score
            const { data: updateData, error: updateError } = await supabase
              .from('user_books')
              .update({ rank_score: defaultScore })
              .eq('id', currentBook.id)
              .select('id, rank_score')
              .single();
            
            if (updateError) {
              console.error('=== RANKING DEBUG: ERROR setting default rank_score ===', updateError);
              Alert.alert('Error', 'Failed to set ranking score');
              setProcessing(false);
              return;
            }
            
            // Verify the update worked
            if (!updateData) {
              console.error('=== RANKING DEBUG: ERROR - No data returned from update ===');
              Alert.alert('Error', 'Failed to set ranking score');
              setProcessing(false);
              return;
            }
            
            if (updateData.rank_score !== defaultScore) {
              console.error('=== RANKING DEBUG: ERROR - Score mismatch ===');
              console.error('Expected:', defaultScore);
              console.error('Got:', updateData.rank_score);
              Alert.alert('Error', 'Failed to set ranking score');
              setProcessing(false);
              return;
            }
            
            console.log('=== RANKING DEBUG: SUCCESS - Default rank_score set successfully ===');
            console.log('Verified score in database:', updateData.rank_score);
            
            setShowRankedConfirmation(true);
            setTimeout(() => {
              setShowRankedConfirmation(false);
              onComplete();
            }, 1500);
          } catch (error) {
            console.error('=== RANKING DEBUG: ERROR setting default score ===', error);
            Alert.alert('Error', 'Failed to set ranking score');
            setProcessing(false);
          }
        }
        return;
      }
      
      // Initialize ranking with existing books
      console.log('Initializing ranking with', rankedBooks.length, 'existing books');
      
      // Set existingBooks first, then reset and flag to start insertion
      // The useEffect will trigger startInserting after the state updates
      setExistingBooks(rankedBooks);
      ranking.reset(rankedBooks);
      setShouldStartInsertion(true);
    } catch (error) {
      console.error('Error loading existing books:', error);
      Alert.alert('Error', 'Failed to load books for ranking');
    } finally {
      setLoading(false);
    }
  };

  // Get current comparison from ranking system
  const comparison = ranking.getCurrentComparison();
  const rankingComplete = ranking.isComplete();
  
  console.log('=== RANKING DEBUG: Render check ===');
  console.log('Comparison:', comparison ? 'exists' : 'null');
  console.log('Ranking complete?', rankingComplete);
  console.log('Should show comparison?', comparison !== null && !rankingComplete);
  
  // Check if ranking completed and we need to save
  useEffect(() => {
    if (rankingComplete && !processing && !showRankedConfirmation) {
      console.log('=== RANKING DEBUG: Ranking completed, saving result ===');
      const result = ranking.getResult();
      console.log('Ranking result:', result);
      
      if (result) {
        console.log('=== RANKING DEBUG: About to save final rank ===');
        console.log('Calculated score:', result.score);
        console.log('Position:', result.position);
        console.log('Score type:', typeof result.score);
        console.log('Score is valid number?', typeof result.score === 'number' && !isNaN(result.score));
        console.log('Book ID to update:', currentBook.id);
        
        if (!currentBook.id || currentBook.id === '') {
          console.error('=== RANKING DEBUG: ERROR - Empty book ID ===');
          Alert.alert('Error', 'Book ID is missing');
          return;
        }
        
        setProcessing(true);
        
        // Save the final rank_score using normalization
        saveFinalRank(result.score, result.position)
          .then(() => {
            console.log('=== RANKING DEBUG: After saveFinalRank ===');
            console.log('saveFinalRank completed, showing confirmation');
            setShowRankedConfirmation(true);
            setProcessing(false);
            setTimeout(() => {
              console.log('=== RANKING DEBUG: Closing modal ===');
              setShowRankedConfirmation(false);
              // Trigger refresh in other screens by navigating to them briefly
              // This ensures ProfileScreen and YourShelfScreen refresh
              onComplete();
            }, 2000);
          })
          .catch((error) => {
            console.error('=== RANKING DEBUG: ERROR saving final rank ===', error);
            setProcessing(false);
            Alert.alert('Error', 'Failed to save ranking');
          });
      } else {
        console.error('=== RANKING DEBUG: ERROR - result is null/undefined ===');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingComplete, processing, showRankedConfirmation]);

  const handlePreference = async (preferredBookId: string) => {
    if (processing) return;

    try {
      console.log('=== RANKING DEBUG: handlePreference ===');
      console.log('Preferred book ID:', preferredBookId);
      console.log('Current book ID:', currentBook.id);
      setProcessing(true);
      
      // Determine if user prefers new book or existing book
      if (preferredBookId === currentBook.id) {
        // User prefers the new book
        console.log('User prefers NEW book');
        ranking.chooseNewBook();
      } else {
        // User prefers the existing book
        console.log('User prefers EXISTING book');
        ranking.chooseExistingBook();
      }

      // Don't check state immediately - let React re-render first
      // The component will re-render and check isComplete() in the render
      setProcessing(false);
      
    } catch (error) {
      console.error('=== RANKING DEBUG: ERROR in handlePreference ===', error);
      Alert.alert('Error', 'Failed to save preference');
      setProcessing(false);
    }
  };

  const saveFinalRank = async (score: number, position: number) => {
    if (!user) {
      console.error('=== RANKING DEBUG: saveFinalRank - No user ===');
      return;
    }

    try {
      console.log('=== RANKING DEBUG: saveFinalRank ===');
      console.log('Function called with score:', score);
      console.log('Function called with position:', position);
      console.log('Score type:', typeof score);
      console.log('Score is NaN?', isNaN(score));
      console.log('Score is null?', score === null);
      console.log('Score is undefined?', score === undefined);
      console.log('Book ID:', currentBook.id);
      console.log('Book ID length:', currentBook.id?.length);
      console.log('User ID:', user.id);
      
      if (!currentBook.id || currentBook.id === '' || currentBook.id.trim() === '') {
        console.error('=== RANKING DEBUG: ERROR - Empty or invalid book ID ===');
        console.error('Current book object:', currentBook);
        Alert.alert('Error', 'Book ID is missing. Please try again.');
        throw new Error('Book ID is empty or invalid');
      }
      
      // Validate position
      if (position < 0 || isNaN(position)) {
        console.error('=== RANKING DEBUG: ERROR - Invalid position ===', position);
        throw new Error(`Invalid position: ${position}`);
      }
      
      if (position === null || position === undefined || isNaN(position)) {
        console.error('=== RANKING DEBUG: ERROR - Invalid position ===', position);
        throw new Error(`Invalid position: ${position}`);
      }
      
      // Update only the new book's rank_score (no renormalization)
      console.log('Calling updateBookRankScore...');
      const newScore = await updateBookRankScore(
        user.id,
        rating,
        currentBook.id,
        position
      );
      console.log('=== RANKING DEBUG: updateBookRankScore completed ===');
      console.log('New score assigned:', newScore);
      
      // Verify the update worked by fetching the book
      console.log('Verifying update by fetching book...');
      const updatedBooks = await getUserBooksByRating(user.id, rating);
      const updatedBook = updatedBooks.find(b => b.id === currentBook.id);
      console.log('Updated book from database:', updatedBook);
      console.log('Updated book rank_score:', updatedBook?.rank_score);
      
      if (updatedBook?.rank_score !== newScore) {
        console.error('=== RANKING DEBUG: ERROR - Score mismatch ===');
        console.error('Expected score:', newScore);
        console.error('Actual score in DB:', updatedBook?.rank_score);
      } else {
        console.log('=== RANKING DEBUG: SUCCESS - Score matches ===');
      }
    } catch (error) {
      console.error('=== RANKING DEBUG: ERROR in saveFinalRank ===', error);
      // Don't show error to user, ranking still worked
      throw error; // Re-throw so caller knows it failed
    }
  };

  const handleSkip = async () => {
    // When skipping, place it at the bottom of the category
    try {
      console.log('=== RANKING DEBUG: handleSkip ===');
      setProcessing(true);
      
      // When skipping, place at the bottom (last position)
      const allBooks = ranking.getBooks();
      console.log('All books in ranking:', allBooks.length);
      const position = allBooks.length; // Insert at the end
      
      console.log('Skipping - placing at position:', position);
      await saveFinalRank(0, position); // Score will be calculated based on position
      
      setShowRankedConfirmation(true);
      setTimeout(() => {
        setShowRankedConfirmation(false);
        onComplete();
      }, 2000);
    } catch (error) {
      console.error('=== RANKING DEBUG: ERROR in handleSkip ===', error);
      Alert.alert('Error', 'Failed to save ranking');
    } finally {
      setProcessing(false);
    }
  };

  if (!visible) return null;

  // Get the comparison book to display
  const comparisonBook = comparison?.bookB;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Which one did you like better?</Text>
          </View>

          {showRankedConfirmation ? (
            <View style={styles.confirmationContainer}>
              <Image
                source={
                  rating === 'liked' 
                    ? require('../../assets/good.png')
                    : rating === 'fine'
                    ? require('../../assets/mid.png')
                    : require('../../assets/bad.png')
                }
                style={styles.confirmationEmoji}
                resizeMode="contain"
              />
              <Text style={styles.confirmationText}>Ranked!</Text>
            </View>
          ) : loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primaryBlue} />
              <Text style={styles.loadingText}>Loading books...</Text>
            </View>
          ) : rankingComplete ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Ranking complete!</Text>
              <Text style={styles.emptySubtext}>
                Your book has been ranked.
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={onComplete}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : !comparison ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading next comparison...</Text>
              <ActivityIndicator size="large" color={colors.primaryBlue} style={{ marginTop: 16 }} />
            </View>
          ) : comparisonBook ? (
            <>
              {/* Comparison Container */}
              <View style={styles.comparisonContainer}>
                {/* Current Book (New Book) */}
                <TouchableOpacity
                  style={styles.bookCard}
                  onPress={() => handlePreference(currentBook.id)}
                  disabled={processing}
                  activeOpacity={0.8}
                >
                  {currentBook.cover_url ? (
                    <Image
                      source={{ uri: currentBook.cover_url }}
                      style={styles.bookCover}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.bookCover, styles.bookCoverPlaceholder]}>
                      <Text style={styles.bookCoverPlaceholderText}>📖</Text>
                    </View>
                  )}
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {currentBook.title}
                  </Text>
                  {currentBook.authors && currentBook.authors.length > 0 && (
                    <Text style={styles.bookAuthor} numberOfLines={1}>
                      {currentBook.authors.join(', ')}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* VS Badge */}
                <View style={styles.vsBadge}>
                  <Text style={styles.vsText}>VS</Text>
                </View>

                {/* Comparison Book (Existing Book) */}
                <TouchableOpacity
                  style={styles.bookCard}
                  onPress={() => handlePreference(comparisonBook.id)}
                  disabled={processing}
                  activeOpacity={0.8}
                >
                  {comparisonBook.cover_url ? (
                    <Image
                      source={{ uri: comparisonBook.cover_url }}
                      style={styles.bookCover}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.bookCover, styles.bookCoverPlaceholder]}>
                      <Text style={styles.bookCoverPlaceholderText}>📖</Text>
                    </View>
                  )}
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {comparisonBook.title}
                  </Text>
                  {comparisonBook.authors && comparisonBook.authors.length > 0 && (
                    <Text style={styles.bookAuthor} numberOfLines={1}>
                      {comparisonBook.authors.join(', ')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Skip Button */}
              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkip}
                disabled={processing}
              >
                <Text style={styles.skipButtonText}>
                  {processing ? 'Processing...' : 'Too hard (skip)'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.creamBackground,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 500,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  comparisonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  bookCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
  },
  bookCover: {
    width: 100,
    aspectRatio: 2/3,
    borderRadius: 8,
    marginBottom: 12,
  },
  bookCoverPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookCoverPlaceholderText: {
    fontSize: 40,
  },
  bookTitle: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    textAlign: 'center',
  },
  vsBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  vsText: {
    fontSize: 18,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '700',
  },
  skipButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  skipButtonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 24,
  },
  doneButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  confirmationContainer: {
    alignItems: 'center',
    padding: 40,
    minHeight: 200,
    justifyContent: 'center',
  },
  confirmationEmoji: {
    width: 64,
    height: 64,
    marginBottom: 16,
  },
  confirmationText: {
    fontSize: 28,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
    fontWeight: '600',
  },
});
