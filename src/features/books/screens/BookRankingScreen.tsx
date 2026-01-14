import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../../../config/theme';
import { updateUserBookDetails, removeBookFromShelf, updateBookStatus } from '../../../services/books';
import { useAuth } from '../../../contexts/AuthContext';
import BookComparisonModal from '../components/BookComparisonModal';
import DateRangePickerModal from '../../../components/ui/DateRangePickerModal';
import { supabase } from '../../../config/supabase';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';

type BookRankingScreenRouteProp = RouteProp<SearchStackParamList, 'BookRanking'>;
type BookRankingScreenNavigationProp = NativeStackNavigationProp<SearchStackParamList, 'BookRanking'>;

export default function BookRankingScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<BookRankingScreenNavigationProp>();
  const route = useRoute<BookRankingScreenRouteProp>();
  const { book, userBookId, initialStatus, previousStatus, wasNewBook = false } = route.params;

  const [rating, setRating] = useState<'liked' | 'fine' | 'disliked' | null>(null);
  const [notes, setNotes] = useState('');
  const [startedDate, setStartedDate] = useState<string | null>(null);
  const [finishedDate, setFinishedDate] = useState<string | null>(null);
  
  // Store initial state for reverting
  const [initialState, setInitialState] = useState<{
    rating: 'liked' | 'fine' | 'disliked' | null;
    notes: string;
    startedDate: string | null;
    finishedDate: string | null;
  } | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showDateRangePickerModal, setShowDateRangePickerModal] = useState(false);
  const notesSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  if (!book) return null;

  const coverUrl = book.cover_url;

  // Fetch initial book state when screen focuses
  useFocusEffect(
    React.useCallback(() => {
      if (userBookId && user) {
        const fetchInitialState = async () => {
          try {
            const { data, error } = await supabase
              .from('user_books')
              .select('rating, notes, started_date, finished_date')
              .eq('id', userBookId)
              .single();

            if (error && error.code !== 'PGRST116') {
              console.error('Error fetching initial book state:', error);
              return;
            }

            if (data) {
              const state = {
                rating: data.rating || null,
                notes: data.notes || '',
                startedDate: data.started_date || null,
                finishedDate: data.finished_date || null,
              };
              setInitialState(state);
              // Set current state to initial state
              setRating(state.rating);
              setNotes(state.notes);
              setStartedDate(state.startedDate);
              setFinishedDate(state.finishedDate);
            } else {
              // New book - no initial state
              setInitialState({
                rating: null,
                notes: '',
                startedDate: null,
                finishedDate: null,
              });
            }
          } catch (error) {
            console.error('Error fetching initial book state:', error);
          }
        };

        fetchInitialState();
      }
    }, [userBookId, user])
  );

  const saveBookDetails = async (selectedRating?: 'liked' | 'fine' | 'disliked') => {
    if (!user || !userBookId) return false;
    
    try {
      console.log('=== SAVE DEBUG: saveBookDetails ===');
      console.log('UserBookId:', userBookId);
      console.log('Rating:', selectedRating || rating);
      console.log('Notes:', notes);
      console.log('Started Date:', startedDate);
      console.log('Finished Date:', finishedDate);
      
      setSaving(true);
      
      // Build update object - only include fields that should be updated
      const updateData: {
        rating?: 'liked' | 'fine' | 'disliked' | null;
        notes?: string | null;
        started_date?: string | null;
        finished_date?: string | null;
      } = {};
      
      // Only update rating if provided (either from parameter or state)
      if (selectedRating !== undefined) {
        updateData.rating = selectedRating;
      } else if (rating !== null && rating !== undefined) {
        updateData.rating = rating;
      }
      
      // Always update notes, dates if they exist
      updateData.notes = notes.trim() || null;
      updateData.started_date = startedDate || null;
      updateData.finished_date = finishedDate || null;
      
      console.log('Update data being sent:', updateData);
      
      const updateResult = await updateUserBookDetails(userBookId, user.id, updateData);
      
      if (updateResult.error) {
        console.error('=== SAVE DEBUG: Database error ===', updateResult.error);
        Alert.alert('Error', 'Failed to save book details');
        setSaving(false);
        return false;
      }
      
      console.log('=== SAVE DEBUG: Success ===');
      console.log('Update result:', updateResult.data);
      setSaving(false);
      return true;
    } catch (error: any) {
      console.error('=== SAVE DEBUG: ERROR in saveBookDetails ===', error);
      Alert.alert('Error', 'Failed to save book details');
      setSaving(false);
      return false;
    }
  };

  const handleRatingSelect = async (selectedRating: 'liked' | 'fine' | 'disliked') => {
    setRating(selectedRating);
    
    // Auto-save when rating is selected
    await saveBookDetails(selectedRating);
  };

  const handleShelveBook = async () => {
    // Show comparison modal if status is "read" and rating is set (liked, fine, or disliked)
    if (initialStatus === 'read' && rating) {
      console.log('=== RANKING DEBUG: handleShelveBook ===');
      console.log('userBookId:', userBookId);
      console.log('Rating:', rating);
      console.log('userBookId type:', typeof userBookId);
      console.log('userBookId length:', userBookId?.length);
      
      if (!userBookId || userBookId === '' || userBookId.trim() === '') {
        console.error('=== RANKING DEBUG: ERROR - Cannot open comparison modal with empty userBookId ===');
        Alert.alert('Error', 'Book ID is missing. Please try adding the book again.');
        return;
      }
      
      // Don't call saveBookDetails() again - rating is already saved when selected
      // Just open the comparison modal
      console.log('Opening comparison modal with userBookId:', userBookId, 'and rating:', rating);
      setShowComparison(true);
    }
  };

  const handleRevert = async (): Promise<void> => {
    if (!user || !userBookId) {
      return;
    }

    try {
      // If it was a new book, remove it from shelf
      if (wasNewBook) {
        const { error } = await removeBookFromShelf(userBookId);
        if (error) {
          console.error('Error removing book from shelf:', error);
          Alert.alert('Error', 'Failed to revert changes');
        }
      } else if (previousStatus && previousStatus !== initialStatus) {
        // Book was moved from another shelf - restore previous status and clear changes
        await updateBookStatus(userBookId, previousStatus, {
          clearRankScore: true,
          touchUpdatedAt: false,
        });
        // Clear any rating, notes, dates that were added
        if (initialState && (
          rating !== initialState.rating ||
          notes !== initialState.notes ||
          startedDate !== initialState.startedDate ||
          finishedDate !== initialState.finishedDate
        )) {
          await updateUserBookDetails(userBookId, user.id, {
            rating: initialState.rating,
            notes: initialState.notes || null,
            started_date: initialState.startedDate || null,
            finished_date: initialState.finishedDate || null,
          }, { touchUpdatedAt: false });
        }
      } else if (initialState) {
        // Book already existed - restore previous rating, notes, dates
        if (
          rating !== initialState.rating ||
          notes !== initialState.notes ||
          startedDate !== initialState.startedDate ||
          finishedDate !== initialState.finishedDate
        ) {
          await updateUserBookDetails(userBookId, user.id, {
            rating: initialState.rating,
            notes: initialState.notes || null,
            started_date: initialState.startedDate || null,
            finished_date: initialState.finishedDate || null,
          }, { touchUpdatedAt: false });
        }
      }
    } catch (error) {
      console.error('Error reverting book state:', error);
      Alert.alert('Error', 'Failed to revert changes');
    }
  };

  const handleClose = async () => {
    await handleRevert();
    navigation.goBack();
  };

  // Cleanup notes save timer on unmount
  useEffect(() => {
    return () => {
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
      }
    };
  }, []);

  // Handle back button with revert logic
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', async (e) => {
      // Prevent default behavior
      e.preventDefault();

      // Check if ranking has been completed (rank_score is set)
      // If so, don't revert - the user has completed the ranking process
      try {
        const { data: currentBook } = await supabase
          .from('user_books')
          .select('rank_score')
          .eq('id', userBookId)
          .single();

        if (currentBook?.rank_score !== null && currentBook?.rank_score !== undefined) {
          // Ranking is complete - allow navigation
          navigation.dispatch(e.data.action);
          return;
        }

        // Ranking not complete - revert changes then navigate
        await handleRevert();
        navigation.dispatch(e.data.action);
      } catch (error) {
        console.error('Error checking rank_score:', error);
        // On error, allow navigation
        navigation.dispatch(e.data.action);
      }
    });

    return unsubscribe;
  }, [navigation, userBookId, user, wasNewBook, previousStatus, initialStatus, initialState, rating, notes, startedDate, finishedDate]);

  const handleComparisonComplete = () => {
    console.log('=== RANKING DEBUG: handleComparisonComplete ===');
    console.log('Comparison modal completed');
    
    setShowComparison(false);
    
    // Verify the score was saved before closing
    console.log('Verifying rank_score was saved...');
    // Small delay to ensure database update completed
    setTimeout(async () => {
      try {
        const { getUserBooksByRating } = await import('../../../services/books');
        if (user && rating) {
          const books = await getUserBooksByRating(user.id, rating);
          const book = books.find(b => b.id === userBookId);
          console.log('=== RANKING DEBUG: Final verification ===');
          console.log('Book rank_score after ranking:', book?.rank_score);
          if (!book?.rank_score) {
            console.error('=== RANKING DEBUG: ERROR - rank_score is still null after ranking! ===');
          } else {
            console.log('=== RANKING DEBUG: SUCCESS - rank_score is set ===');
          }
        }
      } catch (err) {
        console.error('Error verifying rank_score:', err);
      }
      
      // Trigger refresh by navigating to Profile and Your Shelf tabs with a refresh param
      // This ensures screens refresh even if they're already focused
      try {
        const nav = navigation as any;
        // Navigate to Profile tab to trigger refresh
        if (nav.navigate) {
          nav.navigate('Profile', { refresh: Date.now() });
          // Small delay before navigating to Your Shelf to avoid conflicts
          setTimeout(() => {
            nav.navigate('Your Shelf', { refresh: Date.now() });
          }, 100);
        }
      } catch (err) {
        // Ignore navigation errors (screens might not be in stack)
        console.log('Navigation refresh:', err);
      }
    }, 500);
    
    // Navigate back after completion
    navigation.goBack();
  };

  const formatDateForPicker = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateForDisplay = (dateString: string): string => {
    // dateString is in YYYY-MM-DD format, parse it as local date to avoid timezone issues
    const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone shift
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleDateRangePicker = () => {
    setShowDateRangePickerModal(true);
  };

  const handleDateRangeSelected = async (newStartDate: string | null, newEndDate: string | null) => {
    // Validation is handled by DateRangePickerModal, but double-check here
    if (newStartDate && newEndDate && newEndDate < newStartDate) {
      Alert.alert(
        'Invalid Date Range',
        'End date must be on or after the start date. Please adjust your dates.',
        [{ text: 'OK' }]
      );
      setShowDateRangePickerModal(false);
      return;
    }
    
    setStartedDate(newStartDate);
    setFinishedDate(newEndDate);
    // Auto-save when dates are set (regardless of rating)
    await saveBookDetails();
    setShowDateRangePickerModal(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Book Cover */}
          {coverUrl && (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
          )}

          {/* Book Title and Author */}
          <View style={styles.bookHeader}>
            <Text style={styles.title}>{book.title}</Text>
            {book.authors && book.authors.length > 0 && (
              <Text style={styles.author}>{book.authors.join(', ')}</Text>
            )}
          </View>

          {/* Action Icons */}
          <View style={styles.actionIcons}>
            <TouchableOpacity style={styles.actionIcon}>
              <Image
                source={require('../../../../assets/add.png')}
                style={styles.actionIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIcon}>
              <Image
                source={require('../../../../assets/bookmark.png')}
                style={styles.actionIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          {/* Categories */}
          {book.categories && book.categories.length > 0 && (
            <View style={styles.categoriesContainer}>
              {book.categories.slice(0, 4).map((category: string, index: number) => (
                <View key={index} style={styles.categoryChip}>
                  <Text style={styles.categoryText}>{category}</Text>
                </View>
              ))}
            </View>
          )}

          {/* What did you think? Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What did you think?</Text>
            <View style={styles.ratingButtons}>
              <TouchableOpacity
                style={[
                  styles.ratingButton,
                  styles.ratingButtonLiked,
                  rating === 'liked' && styles.ratingButtonSelected,
                ]}
                onPress={() => handleRatingSelect('liked')}
                disabled={saving}
              >
                <Image
                  source={require('../../../../assets/good.png')}
                  style={styles.ratingEmoji}
                  resizeMode="contain"
                />
                <Text style={styles.ratingText}>I liked it!</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.ratingButton,
                  styles.ratingButtonFine,
                  rating === 'fine' && styles.ratingButtonSelected,
                ]}
                onPress={() => handleRatingSelect('fine')}
                disabled={saving}
              >
                <Image
                  source={require('../../../../assets/mid.png')}
                  style={styles.ratingEmoji}
                  resizeMode="contain"
                />
                <Text style={styles.ratingText}>It was okay</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.ratingButton,
                  styles.ratingButtonDisliked,
                  rating === 'disliked' && styles.ratingButtonSelected,
                ]}
                onPress={() => handleRatingSelect('disliked')}
                disabled={saving}
              >
                <Image
                  source={require('../../../../assets/bad.png')}
                  style={styles.ratingEmoji}
                  resizeMode="contain"
                />
                <Text style={styles.ratingText}>I didn't like it</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Read Dates */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={handleDateRangePicker}
            >
              <Text style={styles.dateButtonLabel}>Read dates</Text>
              {startedDate || finishedDate ? (
                <Text style={styles.dateButtonValue}>
                  {startedDate ? formatDateForDisplay(startedDate) : '...'} - {finishedDate ? formatDateForDisplay(finishedDate) : '...'}
                </Text>
              ) : (
                <Text style={styles.dateButtonPlaceholder}>Tap to set</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Add a note */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add a note</Text>
            <View style={styles.notesContainer}>
              <TextInput
                style={styles.notesInput}
                placeholder="Write your thoughts..."
                placeholderTextColor={colors.brownText}
                multiline
                value={notes}
                onChangeText={(text) => {
                  setNotes(text);
                  // Debounced auto-save for notes
                  if (notesSaveTimerRef.current) {
                    clearTimeout(notesSaveTimerRef.current);
                  }
                  notesSaveTimerRef.current = setTimeout(() => {
                    saveBookDetails();
                  }, 1000); // Save 1 second after user stops typing
                }}
                onBlur={() => {
                  // Save immediately when user leaves the input
                  if (notesSaveTimerRef.current) {
                    clearTimeout(notesSaveTimerRef.current);
                  }
                  saveBookDetails();
                }}
              />
              <Text style={styles.notesIcon}>✏️</Text>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Button - Show for "read" status with any rating (liked, fine, or disliked) */}
        {initialStatus === 'read' && rating && (
          <TouchableOpacity
            style={styles.shelveButton}
            onPress={handleShelveBook}
            disabled={saving}
          >
            <Text style={styles.shelveButtonText}>Let's shelve your book!</Text>
          </TouchableOpacity>
        )}

        {/* Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Comparison Modal - Shows after rating "I liked it!" */}
      {rating && userBookId && userBookId.trim() !== '' ? (
        <BookComparisonModal
          visible={showComparison}
          currentBook={{
            id: userBookId,
            title: book.title,
            authors: book.authors,
            cover_url: coverUrl || null,
          }}
          rating={rating}
          onClose={async () => {
            setShowComparison(false);
            // Revert changes when comparison modal is closed
            await handleRevert();
            navigation.goBack();
          }}
          onComplete={handleComparisonComplete}
        />
      ) : null}

      {/* Date Range Picker Modal */}
      <DateRangePickerModal
        visible={showDateRangePickerModal}
        onClose={() => {
          setShowDateRangePickerModal(false);
        }}
        onDateRangeSelected={handleDateRangeSelected}
        initialStartDate={startedDate}
        initialEndDate={finishedDate}
        title="Select Read Dates"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 20 : 20,
    paddingBottom: 100,
  },
  coverImage: {
    width: 120,
    aspectRatio: 2/3,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 16,
    backgroundColor: colors.white,
  },
  bookHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    marginBottom: 8,
    textAlign: 'center',
  },
  author: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    textAlign: 'center',
  },
  actionIcons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBlue,
  },
  actionIconText: {
    fontSize: 20,
    color: colors.brownText,
  },
  actionIconImage: {
    width: 20,
    height: 20,
    tintColor: colors.brownText,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
    marginBottom: 16,
    fontWeight: '600',
  },
  ratingButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  ratingButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 12,
  },
  ratingButtonLiked: {
    backgroundColor: '#4CAF50',
  },
  ratingButtonFine: {
    backgroundColor: '#FFC107',
  },
  ratingButtonDisliked: {
    backgroundColor: '#FF6B6B',
  },
  ratingButtonSelected: {
    borderColor: colors.brownText,
    borderWidth: 3,
  },
  ratingEmoji: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  ratingText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
    textAlign: 'center',
  },
  dateButton: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`, // 33 = 20% opacity in hex
  },
  dateButtonLabel: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 4,
  },
  dateButtonValue: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  dateButtonPlaceholder: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.4,
  },
  notesContainer: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`, // 33 = 20% opacity in hex
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notesInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  notesIcon: {
    fontSize: 20,
    marginLeft: 8,
    marginTop: 4,
  },
  shelveButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  shelveButtonText: {
    fontSize: 18,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
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
  closeButtonText: {
    fontSize: 28,
    color: colors.brownText,
    lineHeight: 28,
  },
});
