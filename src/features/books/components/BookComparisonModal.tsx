import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { colors, typography } from '../../../config/theme';
import { UserBook, getUserBooksByRating, updateTierScoresBatch } from '../../../services/books';
import { useAuth } from '../../../contexts/AuthContext';
import { useErrorHandler } from '../../../contexts/ErrorHandlerContext';
import { useBookRanking } from '../../../hooks/useBookRanking';
import { RankedBook } from '../../../utils/bookRanking';
import { supabase } from '../../../config/supabase';
import goodIcon from '../../../../assets/good.png';
import midIcon from '../../../../assets/mid.png';
import badIcon from '../../../../assets/bad.png';

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
    tier: userBook.rating!, // rating maps 1:1 to tier
    score: userBook.rank_score || 0,
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
  const { handleApiError, showClientError } = useErrorHandler();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showRankedConfirmation, setShowRankedConfirmation] = useState(false);
  const [, setExistingBooks] = useState<RankedBook[]>([]);
  const [shouldStartInsertion, setShouldStartInsertion] = useState(false);

  // Initialize ranking hook with empty array (will be populated when we load books)
  const {
    startInserting,
    chooseNewBook,
    chooseExistingBook,
    skipToBottom,
    getCurrentComparison,
    isComplete,
    getResult,
    reset,
  } = useBookRanking([]);

  // Start insertion after reset completes (when shouldStartInsertion is set to true)
  useEffect(() => {
    if (shouldStartInsertion) {
      startInserting({
        id: currentBook.id,
        title: currentBook.title,
        authors: currentBook.authors || [],
        cover_url: currentBook.cover_url || null,
      }, rating);
      setShouldStartInsertion(false);
    }
  }, [shouldStartInsertion, currentBook, rating, startInserting]);

  const loadExistingBooks = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Get all books in the same rating category
      const categoryBooks = await getUserBooksByRating(user.id, rating);
      
      // Filter out the current book (it's being added)
      const otherBooks = categoryBooks.filter((book) => book.id !== currentBook.id);
      
      // Convert to RankedBook format (only books with rank_score)
      const rankedBooks = otherBooks
        .filter((book) => book.rank_score !== null)
        .map(userBookToRankedBook);
      
      // If no existing books, this is the first in category
      // It should already have default score from updateUserBookDetails
      // But if it doesn't, set it now
      if (rankedBooks.length === 0) {
        // Check if book already has a score
        const currentBookData = categoryBooks.find((b) => b.id === currentBook.id);
        if (currentBookData?.rank_score) {
          setShowRankedConfirmation(true);
          setTimeout(() => {
            setShowRankedConfirmation(false);
            onComplete();
          }, 1500);
        } else {
          // Set default score for first book in category (max score for tier)
          setProcessing(true);
          try {
            // Get max score for tier
            const tierMaxScores = {
              liked: 10.0,
              fine: 6.5,
              disliked: 3.5,
            };
            const defaultScore = tierMaxScores[rating];
            
            
            // Update the book with default score
            const { data: updateData, error: updateError } = await supabase
              .from('user_books')
              .update({ rank_score: defaultScore })
              .eq('id', currentBook.id)
              .select('id, rank_score')
              .single();
            
            if (updateError) {
              handleApiError(updateError, 'save ranking');
              setProcessing(false);
              return;
            }
            
            if (!updateData || updateData.rank_score !== defaultScore) {
              showClientError('Failed to set ranking score');
              setProcessing(false);
              return;
            }
            
            
            setShowRankedConfirmation(true);
            setTimeout(() => {
              setShowRankedConfirmation(false);
              onComplete();
            }, 1500);
          } catch (error) {
            handleApiError(error, 'save ranking');
            setProcessing(false);
          }
        }
        return;
      }
      
      // Initialize ranking with existing books
      
      // Set existingBooks first, then reset and flag to start insertion
      // The useEffect will trigger startInserting after the state updates
      setExistingBooks(rankedBooks);
      reset(rankedBooks);
      setShouldStartInsertion(true);
    } catch (error) {
      handleApiError(error, 'load ranking', loadExistingBooks);
    } finally {
      setLoading(false);
    }
  }, [currentBook.id, onComplete, rating, reset, user, handleApiError, showClientError]);

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
  }, [loadExistingBooks, setExistingBooks, user, visible]);

  // Get current comparison from ranking system
  const comparison = getCurrentComparison();
  const rankingComplete = isComplete();
  
  
  // Check if ranking completed and we need to save
  useEffect(() => {
    if (rankingComplete && !processing && !showRankedConfirmation) {
      const result = getResult();
      
      if (result) {
        
        if (!currentBook.id || currentBook.id === '') {
          showClientError('Book ID is missing');
          return;
        }
        
        setProcessing(true);
        
        // Save the final rank_score
        saveFinalRank(result)
          .then(() => {
            setShowRankedConfirmation(true);
            setProcessing(false);
            setTimeout(() => {
              setShowRankedConfirmation(false);
              // Trigger refresh in other screens by navigating to them briefly
              // This ensures ProfileScreen and YourShelfScreen refresh
              onComplete();
            }, 2000);
          })
          .catch((error) => {
            setProcessing(false);
            handleApiError(error, 'save ranking');
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
      setProcessing(true);
      
      // Determine if user prefers new book or existing book
      if (preferredBookId === currentBook.id) {
        // User prefers the new book
        chooseNewBook();
      } else {
        // User prefers the existing book
        chooseExistingBook();
      }

      // Don't check state immediately - let React re-render first
      // The component will re-render and check isComplete() in the render
      setProcessing(false);
      
    } catch (error) {
      handleApiError(error, 'save ranking');
      setProcessing(false);
    }
  };

  const saveFinalRank = async (result: ReturnType<typeof getResult>) => {
    if (!user || !result) {
      console.error('=== RANKING DEBUG: saveFinalRank - No user or result ===');
      return;
    }

    try {
      
      if (!currentBook.id || currentBook.id === '' || currentBook.id.trim() === '') {
        showClientError('Book ID is missing. Please try again.');
        throw new Error('Book ID is empty or invalid');
      }
      
      // Validate position
      if (result.positionInTier < 0 || isNaN(result.positionInTier)) {
        console.error('=== RANKING DEBUG: ERROR - Invalid position ===', result.positionInTier);
        throw new Error(`Invalid position: ${result.positionInTier}`);
      }
      
      // Check if redistribution happened (has updatedTierBooks)
      if (result.updatedTierBooks && result.updatedTierBooks.length > 0) {
        // Batch update all tier books
        const updates = result.updatedTierBooks.map(book => ({
          id: book.id,
          score: book.score,
        }));
        const otherUpdates = updates.filter((book) => book.id !== result.insertedBook.id);
        
        try {
          if (otherUpdates.length > 0) {
            await updateTierScoresBatch(user.id, rating, otherUpdates, { touchUpdatedAt: false });
          }
        } catch (error) {
          console.error('Batch update failed; proceeding with current book update:', error);
        }
        // Fetch current notes before updating to preserve them
        const { data: _currentBookData } = await supabase
          .from('user_books')
          .select('notes')
          .eq('id', result.insertedBook.id)
          .single();
        
        
        // Ensure the current book gets the normal update (activity + updated_at)
        const { data: currentUpdateData, error: currentUpdateError } = await supabase
          .from('user_books')
          .update({ rank_score: result.score })
          .eq('id', result.insertedBook.id)
          .eq('user_id', user.id)
          .select('id, rank_score, notes')
          .single();
        
        if (currentUpdateError) {
          throw currentUpdateError;
        }
        if (!currentUpdateData || currentUpdateData.rank_score !== result.score) {
          throw new Error(`Score mismatch: expected ${result.score}, got ${currentUpdateData?.rank_score}`);
        }
        
        // Verify notes are preserved (dates are in read_sessions, not user_books)
      } else {
        // Fast path: single book update - use the calculated score directly
        
        // Use result.insertedBook.id instead of currentBook.id to ensure we're using the correct ID
        const bookIdToUpdate = result.insertedBook.id;
        
        // Fetch current notes before updating to preserve them
        const { data: _currentBookData } = await supabase
          .from('user_books')
          .select('notes')
          .eq('id', bookIdToUpdate)
          .single();
        
        
        // Update the book directly with the calculated score
        // The partial update should preserve other fields, but we'll be explicit
        const { data: updateData, error: updateError } = await supabase
          .from('user_books')
          .update({ rank_score: result.score })
          .eq('id', bookIdToUpdate)
          .eq('user_id', user.id)
          .select('id, rank_score, notes')
          .single();
        
        
        if (updateError) {
          throw updateError;
        }
        
        if (!updateData || updateData.rank_score !== result.score) {
          throw new Error(`Score mismatch: expected ${result.score}, got ${updateData?.rank_score}`);
        }
        
        // Verify notes are preserved (dates are in read_sessions, not user_books)
        
      }
      
    } catch (error) {
      handleApiError(error, 'save ranking');
      // Don't throw - let user continue
    }
  };

  const handleSkip = async () => {
    try {
      setProcessing(true);
      // Complete insertion at bottom using the normal ranking safeguards
      skipToBottom();
    } catch (error) {
      handleApiError(error, 'save ranking');
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
                source={rating === 'liked' ? goodIcon : rating === 'fine' ? midIcon : badIcon}
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
