import React, { useState, useEffect, useRef } from 'react';
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
import { formatDateForDisplay } from '../../../utils/dateRanges';
import { updateUserBookDetails, removeBookFromShelf, updateBookStatus, getReadSessions, addReadSession, updateReadSession, deleteReadSession, ReadSession, getUserBooks } from '../../../services/books';
import { useAuth } from '../../../contexts/AuthContext';
import BookComparisonModal from '../components/BookComparisonModal';
import DateRangePickerModal from '../../../components/ui/DateRangePickerModal';
import GenreLabelPicker from '../../../components/books/GenreLabelPicker';
import { supabase } from '../../../config/supabase';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import goodIcon from '../../../../assets/good.png';
import midIcon from '../../../../assets/mid.png';
import badIcon from '../../../../assets/bad.png';

type BookRankingScreenRouteProp = RouteProp<SearchStackParamList, 'BookRanking'>;
type BookRankingScreenNavigationProp = NativeStackNavigationProp<SearchStackParamList, 'BookRanking'>;

export default function BookRankingScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigation = useNavigation<BookRankingScreenNavigationProp>();
  const route = useRoute<BookRankingScreenRouteProp>();
  const {
    book,
    userBookId,
    initialStatus,
    previousStatus,
    wasNewBook = false,
    isNewInstance = false,
    openComparisonOnLoad = false,
  } = route.params;

  const [rating, setRating] = useState<'liked' | 'fine' | 'disliked' | null>(null);
  const [notes, setNotes] = useState('');
  const [startedDate, setStartedDate] = useState<string | null>(null);
  const [finishedDate, setFinishedDate] = useState<string | null>(null);
  const [currentReadSession, setCurrentReadSession] = useState<ReadSession | null>(null);
  const [readSessions, setReadSessions] = useState<ReadSession[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [existingRankScore, setExistingRankScore] = useState<number | null>(null);
  const [rankingCompleted, setRankingCompleted] = useState(false);
  const initialSessionIdsRef = useRef<Set<string>>(new Set());
  const comparisonOpenedRef = useRef(false);
  
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
  
  // Labels/genres state
  const [showGenreLabelPicker, setShowGenreLabelPicker] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [bookGenres, setBookGenres] = useState<string[]>(book?.genres ?? []); // Default genres from books table
  const [userGenres, setUserGenres] = useState<string[] | null>(null); // User's genre overrides
  const [selectedCustomLabels, setSelectedCustomLabels] = useState<string[]>([]);
  const [customLabelSuggestions, setCustomLabelSuggestions] = useState<string[]>([]);
  const [resolvedBookId, setResolvedBookId] = useState<string | null>(book?.id ?? null);
  const [resolvedUserBookId, setResolvedUserBookId] = useState<string | null>(
    userBookId && userBookId.trim() !== '' ? userBookId : null
  );
  
  // Effective genres: user's overrides if set, otherwise book defaults
  const effectiveGenres = userGenres !== null ? userGenres : bookGenres;
  const coverUrl = book?.cover_url;
  const comparisonUserBookId = resolvedUserBookId ?? userBookId ?? null;

  useEffect(() => {
    if (userBookId && userBookId.trim() !== '') {
      setResolvedUserBookId(userBookId);
    }
  }, [userBookId]);

  const ensureUserBookId = React.useCallback(async () => {
    if (resolvedUserBookId) return resolvedUserBookId;
    if (!userId) return null;

    const lookupBookId = resolvedBookId ?? book?.id ?? null;
    if (!lookupBookId) return null;

    const { data, error } = await supabase
      .from('user_books')
      .select('id')
      .eq('user_id', userId)
      .eq('book_id', lookupBookId)
      .single();

    if (error) {
      console.error('Error resolving userBookId:', error);
      return null;
    }

    if (data?.id) {
      setResolvedUserBookId(data.id);
      return data.id;
    }

    return null;
  }, [resolvedUserBookId, userId, resolvedBookId, book?.id]);

  // Fetch initial book state when screen focuses
  useFocusEffect(
    React.useCallback(() => {
      if (userBookId && userId) {
        const fetchInitialState = async () => {
          try {
            // Fetch user_book data including book_id and user_genres
            const { data, error } = await supabase
              .from('user_books')
              .select('rating, notes, custom_labels, user_genres, book_id, rank_score')
              .eq('id', userBookId)
              .single();

            if (error && error.code !== 'PGRST116') {
              console.error('Error fetching initial book state:', error);
              return;
            }

            // Resolve and store the book_id from user_books
            if (data?.book_id) {
              setResolvedBookId(data.book_id);
              
              // Fetch the book's default genres from the books table
              const { data: bookData } = await supabase
                .from('books')
                .select('genres')
                .eq('id', data.book_id)
                .single();
              
              if (bookData?.genres) {
                setBookGenres(bookData.genres);
              }
              
              // Set user's genre overrides if they exist
              if (data.user_genres !== null && data.user_genres !== undefined) {
                setUserGenres(data.user_genres);
              }
            }

            // Fetch read sessions
            const sessions = await getReadSessions(userBookId);
            const latestSession = sessions.length > 0 ? sessions[0] : null;
            setReadSessions(sessions);
            initialSessionIdsRef.current = new Set(sessions.map((session) => session.id));

            if (data) {
              const state = {
                rating: data.rating || null,
                notes: data.notes || '',
                startedDate: latestSession?.started_date || null,
                finishedDate: latestSession?.finished_date || null,
              };
              setInitialState(state);
              // Set current state to initial state
              setRating(state.rating);
              setNotes(state.notes);
              setExistingRankScore(data.rank_score ?? null);
              if (isNewInstance) {
                setStartedDate(null);
                setFinishedDate(null);
                setCurrentReadSession(null);
              } else {
                setStartedDate(state.startedDate);
                setFinishedDate(state.finishedDate);
                setCurrentReadSession(latestSession || null);
              }
              
              // Populate custom labels if they exist
              if (data.custom_labels && data.custom_labels.length > 0) {
                setSelectedCustomLabels(data.custom_labels);
              }
            } else {
              // New book - no initial state
              setInitialState({
                rating: null,
                notes: '',
                startedDate: null,
                finishedDate: null,
              });
              setReadSessions([]);
              initialSessionIdsRef.current = new Set();
              setExistingRankScore(null);
            }
          } catch (error) {
            console.error('Error fetching initial book state:', error);
          }
        };

        fetchInitialState();
      }
    }, [isNewInstance, userBookId, userId])
  );

  // Fetch custom label suggestions for autocomplete
  useEffect(() => {
    const fetchCustomLabelSuggestions = async () => {
      if (!userId) return;
      try {
        const userBooks = await getUserBooks(userId);
        const allLabels = new Set<string>();
        userBooks.forEach((ub) => {
          if (ub.custom_labels?.length) {
            ub.custom_labels.forEach((label) => allLabels.add(label));
          }
        });
        setCustomLabelSuggestions(Array.from(allLabels).sort());
      } catch (error) {
        console.error('Error fetching custom label suggestions:', error);
      }
    };
    fetchCustomLabelSuggestions();
  }, [userId]);

  useEffect(() => {
    if (!openComparisonOnLoad || comparisonOpenedRef.current) return;
    if (initialStatus === 'read' && rating) {
      setShowComparison(true);
      comparisonOpenedRef.current = true;
    }
  }, [openComparisonOnLoad, initialStatus, rating]);

  const saveBookDetails = async (selectedRating?: 'liked' | 'fine' | 'disliked') => {
    if (!user || !userBookId) return false;
    
    try {
      
      setSaving(true);
      
      // Build update object - only include fields that should be updated
      const updateData: {
        rating?: 'liked' | 'fine' | 'disliked' | null;
        notes?: string | null;
      } = {};
      
      // Only update rating if provided (either from parameter or state)
      if (selectedRating !== undefined) {
        updateData.rating = selectedRating;
      } else if (rating !== null && rating !== undefined) {
        updateData.rating = rating;
      }
      
      // Always update notes if they exist
      updateData.notes = notes.trim() || null;
      
      
      // Save notes and rating
      // Use touchUpdatedAt: false to avoid triggering activity cards prematurely
      // Activity card will be created when rank_score is set after ranking completes
      const updateResult = await updateUserBookDetails(userBookId, user.id, updateData, {
        touchUpdatedAt: false,
      });
      
      if (updateResult.error) {
        console.error('=== SAVE DEBUG: Database error ===', updateResult.error);
        console.error('Error details:', JSON.stringify(updateResult.error, null, 2));
        setSaving(false);
        return false;
      }
      
      // Save/update read session for dates
      if (startedDate || finishedDate) {
        if (currentReadSession) {
          // Update existing session
          const { error: sessionError } = await updateReadSession(currentReadSession.id, {
            started_date: startedDate,
            finished_date: finishedDate,
          });
          if (sessionError) {
            console.error('Error updating read session:', sessionError);
            setSaving(false);
            return false;
          }
          setReadSessions((previous) =>
            previous.map((session) =>
              session.id === currentReadSession.id
                ? {
                    ...session,
                    started_date: startedDate,
                    finished_date: finishedDate,
                    updated_at: new Date().toISOString(),
                  }
                : session
            )
          );
        } else {
          // Create new session
          const { data: newSession, error: sessionError } = await addReadSession(userBookId, {
            started_date: startedDate,
            finished_date: finishedDate,
          });
          if (sessionError) {
            console.error('Error adding read session:', sessionError);
            setSaving(false);
            return false;
          }
          // Update current session state
          if (newSession) {
            setCurrentReadSession(newSession);
            setReadSessions((previous) => [newSession, ...previous]);
          }
        }
      }
      
      setSaving(false);
      return true;
    } catch (error: any) {
      console.error('=== SAVE DEBUG: ERROR in saveBookDetails ===', error);
      console.error('Error stack:', error?.stack);
      console.error('Error message:', error?.message);
      // Only show alert for unexpected errors
      if (error?.message && !error.message.includes('cancelled')) {
        Alert.alert('Error', `Failed to save book details: ${error.message}`);
      }
      setSaving(false);
      return false;
    }
  };

  const handleRatingSelect = async (selectedRating: 'liked' | 'fine' | 'disliked') => {
    try {
      setRating(selectedRating);
      
      // Auto-save when rating is selected
      const saved = await saveBookDetails(selectedRating);
      if (!saved) {
        console.warn('Failed to save rating, but continuing...');
        // Don't show alert here - saveBookDetails already handles errors
      }
    } catch (error) {
      console.error('Error in handleRatingSelect:', error);
      // Error should already be handled by saveBookDetails
    }
  };

  const handleShelveBook = async () => {
    // Show comparison modal if status is "read" and rating is set (liked, fine, or disliked)
    if (initialStatus === 'read' && rating) {
      const ensuredUserBookId = await ensureUserBookId();
      if (!ensuredUserBookId || ensuredUserBookId.trim() === '') {
        console.error('=== RANKING DEBUG: ERROR - Cannot open comparison modal with empty userBookId ===');
        Alert.alert('Error', 'Book ID is missing. Please try adding the book again.');
        return;
      }

      setShowComparison(true);
    }
  };

  const handleRevert = React.useCallback(async (): Promise<void> => {
    if (!user || !userBookId) {
      return;
    }

    try {
      if (isNewInstance) {
        if (initialState && (rating !== initialState.rating || notes !== initialState.notes)) {
          await updateUserBookDetails(userBookId, user.id, {
            rating: initialState.rating,
            notes: initialState.notes || null,
          }, { touchUpdatedAt: false });
        }
        if (currentReadSession && !initialSessionIdsRef.current.has(currentReadSession.id)) {
          await deleteReadSession(currentReadSession.id);
          setReadSessions((previous) => previous.filter((session) => session.id !== currentReadSession.id));
          setCurrentReadSession(null);
          setStartedDate(null);
          setFinishedDate(null);
        }
        return;
      }

      // If it was a new book, remove it from shelf
      if (wasNewBook) {
        const { error } = await removeBookFromShelf(userBookId);
        if (error) {
          console.error('Error removing book from shelf:', error);
          Alert.alert('Error', 'Failed to revert changes');
        }
      } else if (previousStatus === null && initialStatus === 'read') {
        // Book existed without a shelf status - revert back to null status
        await updateBookStatus(userBookId, null, {
          clearRankScore: true,
          touchUpdatedAt: false,
        });
        // Clear any rating, notes that were added
        if (initialState && (
          rating !== initialState.rating ||
          notes !== initialState.notes
        )) {
          await updateUserBookDetails(userBookId, user.id, {
            rating: initialState.rating,
            notes: initialState.notes || null,
          }, { touchUpdatedAt: false });
        }
        // Restore dates via read sessions
        if (initialState && (
          startedDate !== initialState.startedDate ||
          finishedDate !== initialState.finishedDate
        )) {
          if (currentReadSession && (initialState.startedDate || initialState.finishedDate)) {
            await updateReadSession(currentReadSession.id, {
              started_date: initialState.startedDate,
              finished_date: initialState.finishedDate,
            });
          } else if (!currentReadSession && (initialState.startedDate || initialState.finishedDate)) {
            await addReadSession(userBookId, {
              started_date: initialState.startedDate,
              finished_date: initialState.finishedDate,
            });
          }
        }
      } else if (previousStatus && previousStatus !== initialStatus) {
        // Book was moved from another shelf - restore previous status and clear changes
        await updateBookStatus(userBookId, previousStatus, {
          clearRankScore: true,
          touchUpdatedAt: false,
        });
        // Clear any rating, notes that were added
        if (initialState && (
          rating !== initialState.rating ||
          notes !== initialState.notes
        )) {
          await updateUserBookDetails(userBookId, user.id, {
            rating: initialState.rating,
            notes: initialState.notes || null,
          }, { touchUpdatedAt: false });
        }
        // Restore dates via read sessions
        if (initialState && (
          startedDate !== initialState.startedDate ||
          finishedDate !== initialState.finishedDate
        )) {
          if (currentReadSession && (initialState.startedDate || initialState.finishedDate)) {
            await updateReadSession(currentReadSession.id, {
              started_date: initialState.startedDate,
              finished_date: initialState.finishedDate,
            });
          } else if (!currentReadSession && (initialState.startedDate || initialState.finishedDate)) {
            await addReadSession(userBookId, {
              started_date: initialState.startedDate,
              finished_date: initialState.finishedDate,
            });
          }
        }
      } else if (initialState) {
        // Book already existed - restore previous rating, notes, dates
        if (
          rating !== initialState.rating ||
          notes !== initialState.notes
        ) {
          await updateUserBookDetails(userBookId, user.id, {
            rating: initialState.rating,
            notes: initialState.notes || null,
          }, { touchUpdatedAt: false });
        }
        // Restore dates via read sessions
        if (
          startedDate !== initialState.startedDate ||
          finishedDate !== initialState.finishedDate
        ) {
          if (currentReadSession && (initialState.startedDate || initialState.finishedDate)) {
            await updateReadSession(currentReadSession.id, {
              started_date: initialState.startedDate,
              finished_date: initialState.finishedDate,
            });
          } else if (!currentReadSession && (initialState.startedDate || initialState.finishedDate)) {
            await addReadSession(userBookId, {
              started_date: initialState.startedDate,
              finished_date: initialState.finishedDate,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error reverting book state:', error);
      Alert.alert('Error', 'Failed to revert changes');
    }
  }, [
    currentReadSession,
    finishedDate,
    initialState,
    initialStatus,
    isNewInstance,
    notes,
    previousStatus,
    rating,
    startedDate,
    user,
    userBookId,
    wasNewBook,
  ]);

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

      if (isNewInstance && !rankingCompleted) {
        await handleRevert();
        navigation.dispatch(e.data.action);
        return;
      }

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
  }, [
    handleRevert,
    initialStatus,
    isNewInstance,
    navigation,
    rankingCompleted,
    user,
    userBookId,
  ]);

  const handleComparisonComplete = async () => {
    
    setShowComparison(false);
    setRankingCompleted(true);
    
    // Ensure dates and notes are saved after ranking completes
    // This is important because saveFinalRank only updates rank_score
    
    // Save dates and notes one more time to ensure they're persisted
    // Use a small delay to ensure rank_score update completed first
    setTimeout(async () => {
      try {
        // Save dates and notes if they exist
        if (notes || startedDate || finishedDate) {
          await saveBookDetails();
        }
        
        // Verify the score was saved before closing
        const { getUserBooksByRating } = await import('../../../services/books');
        if (user && rating && comparisonUserBookId) {
          const books = await getUserBooksByRating(user.id, rating);
          const book = books.find(b => b.id === comparisonUserBookId);
          
          // Verify dates from read sessions
          const sessions = await getReadSessions(comparisonUserBookId);
          
          if (!book?.rank_score) {
            console.error('=== RANKING DEBUG: ERROR - rank_score is still null after ranking! ===');
          }
        }
      } catch (err) {
        console.error('Error saving dates/notes or verifying:', err);
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
      } catch (_err) {
        // Ignore navigation errors (screens might not be in stack)
      }
    }, 300);
    
    // Navigate back after completion
    navigation.goBack();
  };

  const formatSessionRange = (session: ReadSession): string => {
    const start = session.started_date
      ? formatDateForDisplay(session.started_date, { month: 'short' })
      : null;
    const end = session.finished_date
      ? formatDateForDisplay(session.finished_date, { month: 'short' })
      : null;
    if (start && end) return `${start} - ${end}`;
    if (start) return start;
    if (end) return end;
    return 'No dates';
  };

  const handleDateRangePicker = () => {
    setEditingSessionId(null);
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
    
    try {
      if (editingSessionId) {
        const { error } = await updateReadSession(editingSessionId, {
          started_date: newStartDate,
          finished_date: newEndDate,
        });
        if (error) {
          console.error('Error updating read session:', error);
          Alert.alert('Error', 'Failed to update read session');
          return;
        }
        setReadSessions((previous) =>
          previous.map((session) =>
            session.id === editingSessionId
              ? {
                  ...session,
                  started_date: newStartDate,
                  finished_date: newEndDate,
                  updated_at: new Date().toISOString(),
                }
              : session
          )
        );
        if (currentReadSession?.id === editingSessionId) {
          setStartedDate(newStartDate);
          setFinishedDate(newEndDate);
        }
        setEditingSessionId(null);
      } else {
        setStartedDate(newStartDate);
        setFinishedDate(newEndDate);
        // Auto-save when dates are set (regardless of rating)
        const saved = await saveBookDetails();
        if (!saved) {
          console.warn('Failed to save dates, but continuing...');
          // Don't show alert here - saveBookDetails already handles errors
        }
      }
    } catch (error) {
      console.error('Error in handleDateRangeSelected:', error);
      // Error should already be handled by saveBookDetails
    } finally {
      setShowDateRangePickerModal(false);
    }
  };

  const handleEditSession = (session: ReadSession) => {
    setEditingSessionId(session.id);
    setShowDateRangePickerModal(true);
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      'Delete Reading Dates',
      'This will remove these reading dates from your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await deleteReadSession(sessionId);
              if (error) {
                throw error;
              }
              setReadSessions((previous) => previous.filter((session) => session.id !== sessionId));
              if (currentReadSession?.id === sessionId) {
                setCurrentReadSession(null);
                setStartedDate(null);
                setFinishedDate(null);
              }
            } catch (error) {
              console.error('Error deleting read session:', error);
              Alert.alert('Error', 'Failed to delete read session');
            }
          },
        },
      ]
    );
  };

  const handleSaveTags = async (genres: string[], customLabels: string[]) => {
    
    if (!user || !userBookId) {
      return;
    }
    
    try {
      setSavingTags(true);
      
      // Update both user_genres and custom_labels in user_books table (per-user)
      const { error } = await updateUserBookDetails(userBookId, user.id, {
        user_genres: genres,
        custom_labels: customLabels,
      });
      
      if (error) {
        console.error('updateUserBookDetails error:', error);
        Alert.alert('Error', 'Failed to save tags. Please try again.');
        setSavingTags(false);
        return;
      }
      
      // Update local state on success
      setUserGenres(genres);
      setSelectedCustomLabels(customLabels);
      setSavingTags(false);
    } catch (error) {
      console.error('Error saving tags:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setSavingTags(false);
    }
  };

  if (!book) return null;

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

          {isNewInstance && existingRankScore !== null && (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                This will create a new reading instance and update your ranking. Your previous rank (
                {existingRankScore.toFixed(1)}) will be replaced.
              </Text>
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
                  source={goodIcon}
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
                  source={midIcon}
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
                  source={badIcon}
                  style={styles.ratingEmoji}
                  resizeMode="contain"
                />
                <Text style={styles.ratingText}>I didn't like it</Text>
              </TouchableOpacity>
            </View>
          </View>

          {readSessions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Reading history ({readSessions.length})
              </Text>
              <View style={styles.sessionList}>
                {readSessions.map((session) => (
                  <View key={session.id} style={styles.sessionRow}>
                    <Text style={styles.sessionText}>{formatSessionRange(session)}</Text>
                    <View style={styles.sessionActions}>
                      <TouchableOpacity
                        style={styles.sessionActionButton}
                        onPress={() => handleEditSession(session)}
                      >
                        <Text style={styles.sessionActionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.sessionActionButton}
                        onPress={() => handleDeleteSession(session.id)}
                      >
                        <Text style={[styles.sessionActionText, styles.sessionActionDeleteText]}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Read Dates */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={handleDateRangePicker}
            >
              <Text style={styles.dateButtonLabel}>
                {isNewInstance ? 'New reading dates' : 'Read dates'}
              </Text>
              {startedDate || finishedDate ? (
                <Text style={styles.dateButtonValue}>
                  {startedDate ? formatDateForDisplay(startedDate, { month: 'short' }) : '...'} - {finishedDate ? formatDateForDisplay(finishedDate, { month: 'short' }) : '...'}
                </Text>
              ) : (
                <Text style={styles.dateButtonPlaceholder}>Tap to set</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Edit Labels */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowGenreLabelPicker(true)}
            >
              <Text style={styles.dateButtonLabel}>Shelves</Text>
              {(effectiveGenres.length > 0 || selectedCustomLabels.length > 0) ? (
                <Text style={styles.dateButtonValue}>
                  {[...effectiveGenres, ...selectedCustomLabels].slice(0, 3).join(', ')}
                  {(effectiveGenres.length + selectedCustomLabels.length) > 3 ? '...' : ''}
                </Text>
              ) : (
                <Text style={styles.dateButtonPlaceholder}>Tap to add</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Add a note */}
          <View style={styles.section}>
            <View style={styles.notesContainer}>
              <TextInput
                style={styles.notesInput}
                placeholder="Add a note!"
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
            <Text style={styles.shelveButtonText}>
              {isNewInstance ? 'Rank New Instance' : "Let's shelve your book!"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Comparison Modal - Shows after rating "I liked it!" */}
      {rating && comparisonUserBookId && comparisonUserBookId.trim() !== '' ? (
        <BookComparisonModal
          visible={showComparison}
          currentBook={{
            id: comparisonUserBookId,
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
          setEditingSessionId(null);
        }}
        onDateRangeSelected={handleDateRangeSelected}
        initialStartDate={
          editingSessionId
            ? readSessions.find((session) => session.id === editingSessionId)?.started_date || null
            : startedDate
        }
        initialEndDate={
          editingSessionId
            ? readSessions.find((session) => session.id === editingSessionId)?.finished_date || null
            : finishedDate
        }
        title={editingSessionId ? 'Edit Read Dates' : 'Select Read Dates'}
      />

      {/* Genre/Label Picker Modal */}
      <GenreLabelPicker
        visible={showGenreLabelPicker}
        onClose={() => setShowGenreLabelPicker(false)}
        onSave={handleSaveTags}
        apiCategories={book.categories}
        initialGenres={effectiveGenres}
        initialCustomLabels={selectedCustomLabels}
        customLabelSuggestions={customLabelSuggestions}
        bookId={resolvedBookId || book.id}
        loading={savingTags}
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
    paddingBottom: 20,
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
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  infoBanner: {
    backgroundColor: `${colors.primaryBlue}1A`,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.brownText,
    lineHeight: 18,
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
    marginBottom: 16,
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
  },
  sessionList: {
    gap: 10,
  },
  sessionRow: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: `${colors.brownText}22`,
  },
  sessionText: {
    fontSize: 15,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 8,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  sessionActionButton: {
    paddingVertical: 4,
  },
  sessionActionText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  sessionActionDeleteText: {
    color: '#D24B4B',
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
