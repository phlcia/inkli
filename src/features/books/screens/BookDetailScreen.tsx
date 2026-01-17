import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../../../config/theme';
import { BookCoverPlaceholder } from '../components/BookCoverPlaceholder';
import { addBookToShelf, checkUserHasBook, getBookCircles, getBookShelfCounts, removeBookFromShelf, getFriendsRankingsForBook, updateBookStatus, redistributeRanksForRating, BookCirclesResult, BookShelfCounts, formatCount, UserBook, updateUserBookDetails, getReadSessions, addReadSession, updateReadSession, deleteReadSession, ReadSession, updateBookGenres, getUserBooks } from '../../../services/books';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../config/supabase';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import RecentActivityCard from '../../social/components/RecentActivityCard';
import DateRangePickerModal from '../../../components/ui/DateRangePickerModal';
import GenreLabelPicker from '../../../components/books/GenreLabelPicker';

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
  const [circleStats, setCircleStats] = useState<BookCirclesResult | null>(null);
  const [circleLoading, setCircleLoading] = useState(false);
  const [circleError, setCircleError] = useState(false);
  const [userRankScore, setUserRankScore] = useState<number | null>(null);
  const [shelfCounts, setShelfCounts] = useState<BookShelfCounts | null>(null);
  const [friendsRankings, setFriendsRankings] = useState<Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>>([]);
  const [friendsRankingsLoading, setFriendsRankingsLoading] = useState(false);
  const [friendsRankingsError, setFriendsRankingsError] = useState<string | null>(null);
  const [friendsRankingsTotalCount, setFriendsRankingsTotalCount] = useState(0);
  const [friendsRankingsOffset, setFriendsRankingsOffset] = useState(0);
  const friendsRankingsCacheRef = useRef<Map<string, { rankings: Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>; totalCount: number; timestamp: number }>>(new Map());
  const friendsRankingsSectionRef = useRef<View>(null);
  const friendsRankingsHasLoadedRef = useRef(false);
  const friendsRankingsLoadingRef = useRef(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  // "What you think" section state
  const [userBookId, setUserBookId] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState<string>('');
  const [userCustomLabels, setUserCustomLabels] = useState<string[]>([]);
  const [readSessions, setReadSessions] = useState<ReadSession[]>([]);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [showDateRangePickerModal, setShowDateRangePickerModal] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const notesSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Tag editing state
  const [showGenreLabelPicker, setShowGenreLabelPicker] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [customLabelSuggestions, setCustomLabelSuggestions] = useState<string[]>([]);

  const coverUrl = book.cover_url;
  const hasCover =
    Boolean(coverUrl) && !/image not available/i.test(coverUrl ?? '');

  const resolveBookIdForStats = React.useCallback(async () => {
    if (book.id) return book.id;

    if (book.open_library_id) {
      const { data, error } = await supabase
        .from('books')
        .select('id')
        .eq('open_library_id', book.open_library_id)
        .single();

      if (!error && data?.id) {
        return data.id as string;
      }
    }

    if (book.google_books_id) {
      const { data, error } = await supabase
        .from('books')
        .select('id')
        .eq('google_books_id', book.google_books_id)
        .single();

      if (!error && data?.id) {
        return data.id as string;
      }
    }

    return null;
  }, [book.id, book.open_library_id, book.google_books_id]);

  const refreshShelfCounts = React.useCallback(async () => {
    const resolvedBookId = await resolveBookIdForStats();
    if (!resolvedBookId) {
      setShelfCounts({
        read: 0,
        currently_reading: 0,
        want_to_read: 0,
      });
      return;
    }

    try {
      const counts = await getBookShelfCounts(resolvedBookId);
      setShelfCounts(counts);
    } catch (error) {
      console.error('Failed to refresh shelf counts:', error);
    }
  }, [resolveBookIdForStats]);

  // Check if book already exists in user's shelf and fetch notes/dates
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
        const { data } = await supabase
          .from('user_books')
          .select('id, status, rank_score, notes, custom_labels')
          .eq('user_id', user.id)
          .eq('book_id', existingBook.id)
          .single();

        if (data) {
          if (data.status) {
            setCurrentStatus(data.status as 'read' | 'currently_reading' | 'want_to_read');
          } else {
            setCurrentStatus(null);
          }
          setUserRankScore(data.rank_score ?? null);
          // Set "What you think" section data
          setUserBookId(data.id);
          setUserNotes(data.notes || '');
          setUserCustomLabels(data.custom_labels || []);
          
          // Fetch read sessions
          try {
            const sessions = await getReadSessions(data.id);
            setReadSessions(sessions);
          } catch (error) {
            console.error('Error fetching read sessions:', error);
            setReadSessions([]);
          }
        } else {
          setCurrentStatus(null);
          setUserRankScore(null);
          setUserBookId(null);
          setUserNotes('');
          setUserCustomLabels([]);
          setReadSessions([]);
        }
      } else {
        setCurrentStatus(null);
        setUserRankScore(null);
        setUserBookId(null);
        setUserNotes('');
        setUserCustomLabels([]);
        setReadSessions([]);
      }
    } catch (error) {
      // Book doesn't exist yet, that's fine
      console.log('Book not in shelf yet');
      setCurrentStatus(null);
      setUserRankScore(null);
      setUserBookId(null);
      setUserNotes('');
      setReadSessions([]);
    }
  }, [user, book.open_library_id, book.google_books_id]);

  useEffect(() => {
    refreshBookStatus();
  }, [refreshBookStatus]);

  // Load custom label suggestions from user's other books
  useEffect(() => {
    const loadCustomLabelSuggestions = async () => {
      if (!user?.id) return;
      try {
        const userBooks = await getUserBooks(user.id);
        const allLabels = new Set<string>();
        userBooks.forEach((userBook) => {
          if (userBook.custom_labels && userBook.custom_labels.length > 0) {
            userBook.custom_labels.forEach((label) => allLabels.add(label));
          }
        });
        setCustomLabelSuggestions(Array.from(allLabels).sort());
      } catch (error) {
        console.error('Error loading custom label suggestions:', error);
      }
    };
    loadCustomLabelSuggestions();
  }, [user?.id]);

  useEffect(() => {
    let isActive = true;

    const loadCircles = async () => {
      setCircleLoading(true);
      setCircleError(false);

      try {
        const resolvedBookId = await resolveBookIdForStats();
        if (!resolvedBookId) {
          if (isActive) {
            setCircleStats(null);
            setShelfCounts({
              read: 0,
              currently_reading: 0,
              want_to_read: 0,
            });
          }
          return;
        }

        const [stats, counts] = await Promise.all([
          getBookCircles(resolvedBookId, user?.id),
          getBookShelfCounts(resolvedBookId),
        ]);
        if (isActive) {
          setCircleStats(stats);
          setShelfCounts(counts);
        }
      } catch (error) {
        console.error('Error loading book circles:', error);
        if (isActive) {
          setCircleError(true);
          setCircleStats(null);
          setShelfCounts({
            read: 0,
            currently_reading: 0,
            want_to_read: 0,
          });
        }
      } finally {
        if (isActive) {
          setCircleLoading(false);
        }
      }
    };

    loadCircles();

    return () => {
      isActive = false;
    };
  }, [resolveBookIdForStats, user?.id]);

  // Refresh status when returning from BookRanking screen
  useFocusEffect(
    React.useCallback(() => {
      refreshBookStatus();
    }, [refreshBookStatus])
  );

  // Load friends' rankings for this book (with caching and pagination)
  const loadFriendsRankings = useCallback(async (offset: number = 0, append: boolean = false) => {
    if (!user?.id || friendsRankingsLoadingRef.current) {
      return;
    }

    try {
      const resolvedBookId = await resolveBookIdForStats();
      if (!resolvedBookId) {
        setFriendsRankings([]);
        setFriendsRankingsTotalCount(0);
        setFriendsRankingsOffset(0);
        return;
      }

      // Check cache (cache expires after 5 minutes)
      const cacheKey = `${resolvedBookId}_${user.id}`;
      const cached = friendsRankingsCacheRef.current.get(cacheKey);
      const now = Date.now();
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

      if (cached && (now - cached.timestamp) < CACHE_TTL && offset === 0 && !append) {
        setFriendsRankings(cached.rankings);
        setFriendsRankingsTotalCount(cached.totalCount);
        setFriendsRankingsOffset(cached.rankings.length);
        setFriendsRankingsError(null);
        friendsRankingsHasLoadedRef.current = true;
        return;
      }

      friendsRankingsLoadingRef.current = true;
      setFriendsRankingsLoading(true);
      setFriendsRankingsError(null);

      const result = await getFriendsRankingsForBook(resolvedBookId, user.id, {
        offset,
        limit: 20,
      });

      if (append) {
        setFriendsRankings((prev) => [...prev, ...result.rankings]);
        setFriendsRankingsOffset((prev) => prev + result.rankings.length);
      } else {
        setFriendsRankings(result.rankings);
        setFriendsRankingsOffset(result.rankings.length);
        // Update cache
        friendsRankingsCacheRef.current.set(cacheKey, {
          rankings: result.rankings,
          totalCount: result.totalCount,
          timestamp: now,
        });
      }
      setFriendsRankingsTotalCount(result.totalCount);
      friendsRankingsHasLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading friends rankings:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load friends rankings';
      setFriendsRankingsError(errorMessage);
      if (!append) {
        setFriendsRankings([]);
        setFriendsRankingsTotalCount(0);
        setFriendsRankingsOffset(0);
      }
    } finally {
      friendsRankingsLoadingRef.current = false;
      setFriendsRankingsLoading(false);
    }
  }, [resolveBookIdForStats, user?.id]);

  // Reset cache and loading state when book changes
  useEffect(() => {
    friendsRankingsHasLoadedRef.current = false;
    setFriendsRankings([]);
    setFriendsRankingsTotalCount(0);
    setFriendsRankingsOffset(0);
    setFriendsRankingsError(null);
  }, [book.id, book.open_library_id, book.google_books_id]);

  // Initial load - only when component mounts and book ID is resolved
  useEffect(() => {
    if (friendsRankingsHasLoadedRef.current) {
      return;
    }
    loadFriendsRankings(0, false);
  }, [loadFriendsRankings]);

  // Handle retry
  const handleRetryFriendsRankings = useCallback(() => {
    setFriendsRankingsError(null);
    friendsRankingsHasLoadedRef.current = false;
    loadFriendsRankings(0, false);
  }, [loadFriendsRankings]);

  // Handle "Show More"
  const handleShowMoreFriendsRankings = useCallback(() => {
    loadFriendsRankings(friendsRankingsOffset, true);
  }, [loadFriendsRankings, friendsRankingsOffset]);

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

  const getStatusLabel = (status: string | null) => {
    if (!status) return status;
    const labels: Record<string, string> = {
      'want_to_read': 'Want to Read',
      'currently_reading': 'Currently Reading',
      'read': 'Read',
    };
    return labels[status] || status;
  };

  const getEmptyShelfCounts = (): BookShelfCounts => ({
    read: 0,
    currently_reading: 0,
    want_to_read: 0,
  });

  const updateShelfCountsOptimistically = (
    fromStatus: 'read' | 'currently_reading' | 'want_to_read' | null,
    toStatus: 'read' | 'currently_reading' | 'want_to_read' | null
  ) => {
    setShelfCounts((previous) => {
      const next = { ...(previous ?? getEmptyShelfCounts()) };

      if (fromStatus) {
        const shelfKey = fromStatus as keyof typeof next;
        next[shelfKey] = Math.max(0, next[shelfKey] - 1);
      }

      if (toStatus) {
        const shelfKey = toStatus as keyof typeof next;
        next[shelfKey] += 1;
      }

      return next;
    });
  };

  const handleIconPress = async (status: 'read' | 'currently_reading' | 'want_to_read') => {
    if (!user) {
      setToastMessage('You must be logged in to add books');
      return;
    }

    if (loading) return;

    const previousStatus = currentStatus;
    const previousCounts = shelfCounts;
    const rollbackOptimisticUpdate = () => {
      setCurrentStatus(previousStatus);
      setShelfCounts(previousCounts);
    };

    try {
      setLoading(status);
      setAnimatedIcon(status);
      
      // Check if book is already on this status
      const isCurrentlyOnThisStatus = currentStatus === status;
      
      if (isCurrentlyOnThisStatus) {
        updateShelfCountsOptimistically(status, null);
        setCurrentStatus(null);
        setUserRankScore(null);
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
            const shouldKeepDetails = status === 'read';
            
            // If removing from "read" shelf, check if redistribution is needed
            if (shouldKeepDetails) {
              // Fetch the book's rank_score and rating before removing
              const { data: userBookData } = await supabase
                .from('user_books')
                .select('rank_score, rating')
                .eq('id', checkResult.userBookId)
                .single();
              
              const rankScore = userBookData?.rank_score;
              const rating = userBookData?.rating as 'liked' | 'fine' | 'disliked' | null;
              
              // Remove the book - use touchUpdatedAt: false to skip activity card creation
              const { error } = await updateBookStatus(checkResult.userBookId, null, { 
                clearRankScore: true,
                touchUpdatedAt: false,
              });
              
              if (error) {
                throw error;
              }
              
              // If the book had a max score (10.0, 6.5, or 3.5) and a rating, redistribute
              // Use Math.abs to handle floating point precision issues
              if (rating && rankScore !== null && (
                (rating === 'liked' && Math.abs(rankScore - 10.0) < 0.001) ||
                (rating === 'fine' && Math.abs(rankScore - 6.5) < 0.001) ||
                (rating === 'disliked' && Math.abs(rankScore - 3.5) < 0.001)
              )) {
                // Redistribute ranks for this rating category
                await redistributeRanksForRating(user.id, rating);
              }
            } else {
              const { error } = await removeBookFromShelf(checkResult.userBookId);
              if (error) {
                throw error;
              }
            }
            
            // Update UI
            setLoading(null);
            // Removed toast and navigation - no feedback needed for removing from shelf
            void refreshShelfCounts();
          } else {
            rollbackOptimisticUpdate();
            setToastMessage('Book not found on shelf');
          }
        } else {
          rollbackOptimisticUpdate();
          setToastMessage('Book not found');
        }
      } else {
        if (status === 'read') {
          const resolvedBookId = await resolveBookIdForStats();
          if (resolvedBookId) {
            const checkResult = await checkUserHasBook(resolvedBookId, user.id);
            if (checkResult.exists && checkResult.userBookId) {
              updateShelfCountsOptimistically(previousStatus, status);
              setCurrentStatus(status);
              setUserRankScore(null);
              const { error } = await updateBookStatus(checkResult.userBookId, status, {
                touchUpdatedAt: false,
              });
              if (error) {
                throw error;
              }
              setLoading(null);
              navigation.navigate('BookRanking', {
                book,
                userBookId: checkResult.userBookId,
                initialStatus: status,
                previousStatus: (checkResult.currentStatus as 'read' | 'currently_reading' | 'want_to_read' | undefined) || null,
                wasNewBook: false,
              });
              void refreshShelfCounts();
              return;
            }
          }
        }

        updateShelfCountsOptimistically(previousStatus, status);
        setCurrentStatus(status);
        setUserRankScore(null);
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
          rollbackOptimisticUpdate();
          setToastMessage('Failed to add book - missing book ID');
          setLoading(null);
          return;
        }
        
        const isUpdate = result.isUpdate && currentStatus !== null;
        const isMoving = isUpdate && result.previousStatus !== status;
        
        setCurrentStatus(status);
        setUserRankScore(null);
        
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
          void refreshShelfCounts();
        } else {
          // For 'currently_reading' or 'want_to_read', just update the UI without opening ranking screen
          setLoading(null);
          void refreshShelfCounts();
        }
        
        // Removed toast messages - no feedback needed for adding to shelf
      }
    } catch (error: any) {
      console.error('Error managing book:', error);
      rollbackOptimisticUpdate();
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

  const metadata = book.page_count ? `${book.page_count}p` : null;

  const formatCircleScore = (value: number | null | undefined) => {
    if (circleLoading || circleError) return '--';
    if (value === null || value === undefined) return '--';
    return value.toFixed(1);
  };

  const formatCircleCount = (value: number | null | undefined) => {
    if (circleLoading || circleError) return '--';
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

  const formatDateForDisplay = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateRange = (
    startDate: string | null,
    endDate: string | null
  ): string | null => {
    if (!startDate && !endDate) return null;
    if (startDate && endDate) {
      return `${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}`;
    }
    if (startDate) {
      return formatDateForDisplay(startDate);
    }
    if (endDate) {
      return formatDateForDisplay(endDate);
    }
    return null;
  };

  // Save notes with debouncing
  const saveNotes = React.useCallback(async (notesText: string) => {
    if (!user || !userBookId) {
      // If book not on shelf yet, we'll need to add it first
      // For now, just return - user needs to add book to shelf first
      return;
    }

    try {
      setSavingNotes(true);
      setNotesSaved(false);
      
      const { error } = await updateUserBookDetails(userBookId, user.id, {
        notes: notesText.trim() || null,
      });

      if (error) {
        console.error('Error saving notes:', error);
        setToastMessage('Couldn\'t save your notes. Please try again.');
        setSavingNotes(false);
        return;
      }

      setSavingNotes(false);
      setNotesSaved(true);
      
      // Fade out "Saved ✓" after 2 seconds
      setTimeout(() => {
        setNotesSaved(false);
      }, 2000);

      // Refresh book status to ensure sync
      void refreshBookStatus();
    } catch (error) {
      console.error('Error saving notes:', error);
      setToastMessage('Couldn\'t save your notes. Please try again.');
      setSavingNotes(false);
    }
  }, [user, userBookId, refreshBookStatus]);

  // Handle notes change with debouncing
  const handleNotesChange = React.useCallback((text: string) => {
    setUserNotes(text);
    setNotesSaved(false);

    // Clear existing timer
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
    }

    // Set new timer for debounced save
    notesSaveTimerRef.current = setTimeout(() => {
      void saveNotes(text);
    }, 800);
  }, [saveNotes]);

  // Handle notes blur - save immediately
  const handleNotesBlur = React.useCallback(() => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
    }
    void saveNotes(userNotes);
  }, [userNotes, saveNotes]);

  // Add a new read session
  const handleAddReadSession = React.useCallback(async (newStartDate: string | null, newEndDate: string | null) => {
    if (!user || !userBookId) {
      setToastMessage('Please add this book to your shelf first');
      return;
    }

    try {
      setSavingDates(true);
      
      const { data, error } = await addReadSession(userBookId, {
        started_date: newStartDate,
        finished_date: newEndDate,
      });

      if (error) {
        console.error('Error adding read session:', error);
        setToastMessage(error.message || 'Couldn\'t save dates. Please try again.');
        setSavingDates(false);
        return;
      }

      if (data) {
        setReadSessions((prev) => [data, ...prev]);
      }
      setSavingDates(false);

      // Refresh book status to ensure sync
      void refreshBookStatus();
    } catch (error) {
      console.error('Error adding read session:', error);
      setToastMessage('Couldn\'t save dates. Please try again.');
      setSavingDates(false);
    }
  }, [user, userBookId, refreshBookStatus]);

  // Update an existing read session
  const handleUpdateReadSession = React.useCallback(async (sessionId: string, newStartDate: string | null, newEndDate: string | null) => {
    if (!user) return;

    try {
      setSavingDates(true);
      
      const { data, error } = await updateReadSession(sessionId, {
        started_date: newStartDate,
        finished_date: newEndDate,
      });

      if (error) {
        console.error('Error updating read session:', error);
        setToastMessage(error.message || 'Couldn\'t update dates. Please try again.');
        setSavingDates(false);
        return;
      }

      if (data) {
        setReadSessions((prev) => 
          prev.map((session) => session.id === sessionId ? data : session)
        );
      }
      setSavingDates(false);

      // Refresh book status to ensure sync
      void refreshBookStatus();
    } catch (error) {
      console.error('Error updating read session:', error);
      setToastMessage('Couldn\'t update dates. Please try again.');
      setSavingDates(false);
    }
  }, [user, refreshBookStatus]);

  // Delete a read session
  const handleDeleteReadSession = React.useCallback(async (sessionId: string) => {
    if (!user) return;

    try {
      setSavingDates(true);
      
      const { error } = await deleteReadSession(sessionId);

      if (error) {
        console.error('Error deleting read session:', error);
        setToastMessage('Couldn\'t delete dates. Please try again.');
        setSavingDates(false);
        return;
      }

      setReadSessions((prev) => prev.filter((session) => session.id !== sessionId));
      setSavingDates(false);

      // Refresh book status to ensure sync
      void refreshBookStatus();
    } catch (error) {
      console.error('Error deleting read session:', error);
      setToastMessage('Couldn\'t delete dates. Please try again.');
      setSavingDates(false);
    }
  }, [user, refreshBookStatus]);

  // Handle date range picker selection
  const handleDateRangeSelected = React.useCallback((newStartDate: string | null, newEndDate: string | null) => {
    if (editingSessionId) {
      void handleUpdateReadSession(editingSessionId, newStartDate, newEndDate);
    } else {
      void handleAddReadSession(newStartDate, newEndDate);
    }
    setShowDateRangePickerModal(false);
    setEditingSessionId(null);
  }, [editingSessionId, handleAddReadSession, handleUpdateReadSession]);

  // Open date range picker (for adding new session)
  const openDateRangePicker = React.useCallback(() => {
    setEditingSessionId(null);
    setShowDateRangePickerModal(true);
  }, []);

  // Open date range picker (for editing existing session)
  const openDateRangePickerForEdit = React.useCallback((sessionId: string) => {
    setEditingSessionId(sessionId);
    setShowDateRangePickerModal(true);
  }, []);

  // Sort sessions: unfinished first, then by most recent finished date
  const sortedSessions = React.useMemo(() => {
    return [...readSessions].sort((a, b) => {
      // Unfinished sessions (currently reading) come first
      if (!a.finished_date && b.finished_date) return -1;
      if (a.finished_date && !b.finished_date) return 1;
      
      // Both unfinished or both finished - sort by most recent date
      const dateA = a.finished_date || a.started_date || a.created_at;
      const dateB = b.finished_date || b.started_date || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [readSessions]);

  // Cleanup notes save timer on unmount
  useEffect(() => {
    return () => {
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
      }
    };
  }, []);

  // Handle tag editing
  const handleSaveTags = React.useCallback(async (genres: string[], customLabels: string[]) => {
    if (!user || !userBookId || !book.id) return;

    try {
      setSavingTags(true);

      // Update book genres
      const { error: genresError } = await updateBookGenres(book.id, genres);
      if (genresError) {
        throw genresError;
      }

      // Update user_books custom_labels
      const { error: labelsError } = await updateUserBookDetails(userBookId, user.id, {
        custom_labels: customLabels,
      });
      if (labelsError) {
        throw labelsError;
      }

      // Refresh book status to get updated data
      await refreshBookStatus();
      setSavingTags(false);
      setToastMessage('Tags updated!');
    } catch (error) {
      console.error('Error saving tags:', error);
      setToastMessage('Couldn\'t save tags. Please try again.');
      setSavingTags(false);
    }
  }, [user, userBookId, book.id, refreshBookStatus]);

  const getActionText = (status: string | null, username: string) => {
    const displayName = username || 'User';
    switch (status) {
      case 'read':
        return `${displayName} finished`;
      case 'currently_reading':
        return `${displayName} started reading`;
      case 'want_to_read':
        return `${displayName} bookmarked`;
      default:
        return `${displayName} added`;
    }
  };

  const handleFriendBookPress = async (userBook: UserBook) => {
    if (!userBook.book) return;

    try {
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', userBook.book_id)
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
    }
  };

  // Skeleton loading card component
  const FriendsRankingSkeletonCard = () => (
    <View style={styles.activityCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.cardAvatar, styles.skeleton]} />
          <View style={styles.cardHeaderText}>
            <View style={[styles.skeleton, styles.skeletonText, { width: '70%', marginBottom: 8 }]} />
            <View style={[styles.skeleton, styles.skeletonText, { width: '50%' }]} />
          </View>
        </View>
        <View style={[styles.scoreCircle, styles.skeleton]} />
      </View>
      <View style={styles.bookInfoSection}>
        <View style={[styles.bookCover, styles.skeleton]} />
        <View style={styles.bookInfo}>
          <View style={[styles.skeleton, styles.skeletonText, { width: '80%', marginBottom: 8, height: 16 }]} />
          <View style={[styles.skeleton, styles.skeletonText, { width: '60%', height: 14 }]} />
        </View>
      </View>
    </View>
  );

  const ShelfCountStack = ({ count }: { count: number }) => (
    <View style={styles.shelfCountBadge} pointerEvents="none">
      <Text style={styles.shelfCountText}>{formatCount(count)}</Text>
    </View>
  );

  const hasUserCircle = userRankScore !== null;

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
        {hasCover ? (
          <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="contain" />
        ) : (
          <View style={styles.coverPlaceholder}>
            <BookCoverPlaceholder
              title={book.title}
              author={book.authors?.join(', ') || 'Unknown Author'}
              width={200}
              height={300}
            />
          </View>
        )}

        {/* Header Row: Title/Author on left, Icons on right */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{book.title}</Text>
            <Text style={styles.authorMetadata}>
              {book.authors?.join(', ') || 'Unknown Author'}
              {metadata && ` | ${metadata}`}
            </Text>
          </View>
          
          {/* Quick Action Icons */}
          <View style={styles.actionIconsContainer}>
            {/* Add to Read */}
            <View style={styles.actionIconWrapper}>
              <TouchableOpacity
                style={styles.actionIcon}
                onPress={() => handleIconPress('read')}
                disabled={Boolean(loading)}
              >
                <Image
                  source={require('../../../../assets/add.png')}
                  style={[
                    styles.actionIconImage,
                    isIconActive('read') && styles.actionIconImageActiveBlue,
                  ]}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>

            {/* Currently Reading */}
            <View style={styles.actionIconWrapper}>
              <TouchableOpacity
                style={styles.actionIcon}
                onPress={() => handleIconPress('currently_reading')}
                disabled={Boolean(loading)}
              >
                <Image
                  source={require('../../../../assets/reading.png')}
                  style={[
                    styles.actionIconImage,
                    isIconActive('currently_reading') && styles.actionIconImageActiveBlue,
                  ]}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              {shelfCounts && shelfCounts.currently_reading > 0 && (
                <ShelfCountStack count={shelfCounts.currently_reading} />
              )}
            </View>

            {/* Want to Read */}
            <View style={styles.actionIconWrapper}>
              <TouchableOpacity
                style={styles.actionIcon}
                onPress={() => handleIconPress('want_to_read')}
                disabled={Boolean(loading)}
              >
                <Image
                  source={require('../../../../assets/bookmark.png')}
                  style={[
                    styles.actionIconImage,
                    isIconActive('want_to_read') && styles.actionIconImageActiveBlue,
                  ]}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              {shelfCounts && shelfCounts.want_to_read > 0 && (
                <ShelfCountStack count={shelfCounts.want_to_read} />
              )}
            </View>
          </View>
        </View>

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

        {/* Rating Circles */}
        <View style={styles.circlesSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.circlesScrollContent}
          >
            <View style={styles.circlesRow}>
              {userRankScore !== null && (
                <View style={styles.circleCard}>
                  <View
                    style={[
                      styles.ratingCircle,
                      { backgroundColor: getScoreTierColor(userRankScore, 1) },
                    ]}
                  >
                    <Text style={styles.circleScore}>
                      {formatCircleScore(userRankScore)}
                    </Text>
                  </View>
                  <Text style={styles.circleLabel}>What you{'\n'}think</Text>
                </View>
              )}
              <View style={styles.circleCard}>
                <View
                  style={[
                    styles.ratingCircle,
                    { backgroundColor: getScoreTierColor(circleStats?.friends.average ?? null, circleStats?.friends.count ?? 0) },
                  ]}
                >
                  <Text style={styles.circleScore}>
                    {formatCircleScore(circleStats?.friends.average)}
                  </Text>
                  {Boolean(circleStats?.friends.count) && (
                    <View style={styles.circleCountBadge}>
                      <Text style={styles.circleCountText}>
                        {formatCircleCount(circleStats?.friends.count)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.circleLabel}>What your{'\n'}friends think</Text>
              </View>
              <View style={styles.circleCard}>
                <View
                  style={[
                    styles.ratingCircle,
                    { backgroundColor: getScoreTierColor(circleStats?.global.average ?? null, circleStats?.global.count ?? 0) },
                  ]}
                >
                  <Text style={styles.circleScore}>
                    {formatCircleScore(circleStats?.global.average)}
                  </Text>
                  {Boolean(circleStats?.global.count) && (
                    <View style={styles.circleCountBadge}>
                      <Text style={styles.circleCountText}>
                        {formatCircleCount(circleStats?.global.count)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.circleLabel}>What Inkli{'\n'}users think</Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Description */}
        {book.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionLabel}>Description</Text>
            <Text style={styles.description}>{book.description}</Text>
          </View>
        )}

        {/* Additional Info */}
        <View style={styles.descriptionSection}>
          <Text style={styles.descriptionLabel}>Additional Information</Text>
          <View style={styles.infoSection}>
            {book.publisher && (
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>Publisher: </Text>
                {book.publisher}
              </Text>
            )}
            {book.published_date && (
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>Publish Date: </Text>
                {book.published_date}
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
        </View>

        {/* What You Think */}
        {user && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionLabel}>What you think</Text>
            
            {/* Edit Tags */}
            {userBookId && (
              <View style={styles.whatYouThinkSlot}>
                <Text style={styles.whatYouThinkSlotLabel}>Shelves</Text>

                {/* Genre and label chips */}
                {((book.genres && book.genres.length > 0) || userCustomLabels.length > 0) && (
                  <View style={styles.tagsChipsContainer}>
                    {book.genres && book.genres.length > 0 && (
                      <View style={styles.tagsChipsRow}>
                        {book.genres.map((genre: string) => (
                          <View key={genre} style={styles.tagPreviewChip}>
                            <Text style={styles.tagPreviewChipText}>{genre}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {userCustomLabels.length > 0 && (
                      <View style={[styles.tagsChipsRow, { marginTop: 8 }]}>
                        {userCustomLabels.map((label: string) => (
                          <View key={label} style={styles.customLabelPreviewChip}>
                            <Text style={styles.customLabelPreviewChipText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.dateRangeButton, ((book.genres && book.genres.length > 0) || userCustomLabels.length > 0) && styles.dateRangeButtonActive]}
                  onPress={() => setShowGenreLabelPicker(true)}
                  disabled={savingTags}
                >
                  <Text style={[styles.dateRangeButtonText, ((book.genres && book.genres.length > 0) || userCustomLabels.length > 0) && styles.dateRangeButtonTextActive]}>
                    Add to a shelf
                  </Text>
                </TouchableOpacity>
                {savingTags && (
                  <View style={styles.savingContainer}>
                    <ActivityIndicator size="small" color={colors.primaryBlue} />
                    <Text style={styles.savingText}>Saving...</Text>
                  </View>
                )}
              </View>
            )}

            {/* Add read dates */}
            <View style={styles.whatYouThinkSlot}>
              <Text style={styles.whatYouThinkSlotLabel}>Read dates</Text>

              {/* Date range chips */}
              {sortedSessions.length > 0 ? (
                <View style={styles.dateChipsContainer}>
                  {sortedSessions.map((session) => (
                    <View key={session.id} style={styles.dateChip}>
                      <TouchableOpacity
                        onPress={() => openDateRangePickerForEdit(session.id)}
                        style={styles.dateChipContent}
                      >
                        <Text style={styles.dateChipText}>
                          {session.started_date ? formatDateForDisplay(session.started_date) : '...'} - {session.finished_date ? formatDateForDisplay(session.finished_date) : '...'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteReadSession(session.id)}
                        style={styles.dateChipClose}
                        disabled={savingDates}
                      >
                        <Text style={styles.dateChipCloseText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.whatYouThinkSlotPlaceholder}>
                  Add when you started/finished reading
                </Text>
              )}

              <TouchableOpacity
                style={[styles.dateRangeButton, readSessions.length > 0 && styles.dateRangeButtonActive]}
                onPress={openDateRangePicker}
                disabled={savingDates}
              >
                <Text style={[styles.dateRangeButtonText, readSessions.length > 0 && styles.dateRangeButtonTextActive]}>
                  Add read dates
                </Text>
              </TouchableOpacity>
              {savingDates && (
                <View style={styles.savingContainer}>
                  <ActivityIndicator size="small" color={colors.primaryBlue} />
                  <Text style={styles.savingText}>Saving...</Text>
                </View>
              )}
            </View>

            {/* Notes */}
            <View style={styles.whatYouThinkSlot}>
              <View style={styles.notesHeader}>
                <Text style={styles.whatYouThinkSlotLabel}>Notes</Text>
              </View>
              <View style={styles.notesContainer}>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Tap to add your thoughts about this book..."
                  placeholderTextColor={colors.brownText}
                  multiline
                  value={userNotes}
                  onChangeText={handleNotesChange}
                  onBlur={handleNotesBlur}
                  editable={!savingNotes}
                />
                <View style={styles.notesFooter}>
                  {savingNotes && (
                    <Text style={styles.savingText}>Saving...</Text>
                  )}
                  {notesSaved && !savingNotes && (
                    <Text style={styles.savedText}>Saved ✓</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* What Your Friends Think */}
        {(friendsRankings.length > 0 || friendsRankingsLoading || friendsRankingsError) && (
          <View 
            style={styles.descriptionSection}
            ref={friendsRankingsSectionRef}
          >
            <Text style={styles.descriptionLabel}>What your friends think</Text>
            
            {friendsRankingsError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{friendsRankingsError}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetryFriendsRankings}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {friendsRankingsLoading && friendsRankings.length === 0 && (
              <>
                <FriendsRankingSkeletonCard />
                <FriendsRankingSkeletonCard />
                <FriendsRankingSkeletonCard />
              </>
            )}

            {friendsRankings.map((friendRanking) => {
              const userProfile = friendRanking.user_profile;
              if (!userProfile || !friendRanking.book) return null;

              return (
                <RecentActivityCard
                  key={friendRanking.id}
                  userBook={friendRanking}
                  actionText={getActionText(friendRanking.status, userProfile.username)}
                  userDisplayName={userProfile.username}
                  avatarUrl={userProfile.profile_photo_url}
                  avatarFallback={userProfile.username?.charAt(0).toUpperCase() || 'U'}
                  onPressBook={handleFriendBookPress}
                  onPressUser={() =>
                    navigation.navigate('UserProfile', {
                      userId: userProfile.user_id,
                      username: userProfile.username,
                    })
                  }
                  formatDateRange={formatDateRange}
                  viewerStatus={null}
                  showCommentsLink={true}
                  showCommentIcon={true}
                  hideActionText={true}
                  hideBookInfo={true}
                />
              );
            })}

            {friendsRankingsLoading && friendsRankings.length > 0 && (
              <FriendsRankingSkeletonCard />
            )}

            {!friendsRankingsError && friendsRankings.length > 0 && friendsRankings.length < friendsRankingsTotalCount && (
              <TouchableOpacity
                style={styles.showMoreButton}
                onPress={handleShowMoreFriendsRankings}
                disabled={friendsRankingsLoading}
              >
                {friendsRankingsLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.showMoreButtonText}>
                    Show More ({friendsRankingsTotalCount - friendsRankings.length} remaining)
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
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

      {/* Date Range Picker Modal */}
      <DateRangePickerModal
        visible={showDateRangePickerModal}
        onClose={() => {
          setShowDateRangePickerModal(false);
          setEditingSessionId(null);
        }}
        onDateRangeSelected={handleDateRangeSelected}
        initialStartDate={editingSessionId ? readSessions.find(s => s.id === editingSessionId)?.started_date || null : null}
        initialEndDate={editingSessionId ? readSessions.find(s => s.id === editingSessionId)?.finished_date || null : null}
        title={editingSessionId ? "Edit Read Dates" : "Select Read Dates"}
      />

      {/* Genre Label Picker Modal */}
      {userBookId && (
        <GenreLabelPicker
          visible={showGenreLabelPicker}
          onClose={() => setShowGenreLabelPicker(false)}
          onSave={handleSaveTags}
          apiCategories={book.categories}
          initialGenres={book.genres || []}
          initialCustomLabels={userCustomLabels}
          customLabelSuggestions={customLabelSuggestions}
          bookId={book.id}
          loading={savingTags}
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
  coverPlaceholder: {
    marginBottom: 24,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    marginBottom: 8,
    textAlign: 'left',
  },
  authorMetadata: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    textAlign: 'left',
    opacity: 0.8,
  },
  actionIconsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionIconWrapper: {
    position: 'relative',
  },
  actionIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  actionIconImage: {
    width: 30,
    height: 30,
    tintColor: colors.brownText,
  },
  actionIconImageActiveBlue: {
    tintColor: colors.primaryBlue,
  },
  shelfCountBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brownText,
    borderWidth: 2,
    borderColor: colors.creamBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shelfCountText: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 10,
    marginRight: -8,
  },
  circlesSection: {
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  circlesScrollContent: {
    paddingRight: 24,
    paddingVertical: 8,
  },
  circlesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    minWidth: 100,
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
  circleLabel: {
    marginLeft: 10,
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.brownText,
    textAlign: 'left',
    lineHeight: 16,
    opacity: 0.8,
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
    marginTop: 0,
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
  skeleton: {
    backgroundColor: colors.brownText,
    opacity: 0.1,
  },
  skeletonText: {
    height: 12,
    borderRadius: 4,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  showMoreButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
  },
  showMoreButtonText: {
    color: colors.white,
    fontFamily: typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  activityCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  cardAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  scoreCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  bookInfoSection: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bookCover: {
    width: 60,
    aspectRatio: 2 / 3,
    borderRadius: 4,
    marginRight: 12,
  },
  bookInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  whatYouThinkSlot: {
    marginBottom: 20,
  },
  whatYouThinkSlotLabel: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 8,
  },
  whatYouThinkSlotContent: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brownText + '20',
  },
  whatYouThinkSlotPlaceholder: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.5,
  },
  disabledSlot: {
    opacity: 0.5,
    backgroundColor: colors.creamBackground,
  },
  disabledSlotText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  readCountBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  readCountText: {
    fontSize: 12,
    fontFamily: typography.body,
    fontWeight: '600',
    color: '#2E7D32',
  },
  dateChipsContainer: {
    marginBottom: 12,
    gap: 8,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBlue,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dateChipContent: {
    flex: 1,
  },
  dateChipText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
  },
  dateChipClose: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateChipCloseText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  dateRangeButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue + '20',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBlue + '40',
    marginTop: 8,
  },
  dateRangeButtonActive: {
    backgroundColor: colors.primaryBlue,
  },
  dateRangeButtonText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.primaryBlue,
    fontWeight: '500',
  },
  dateRangeButtonTextActive: {
    color: colors.white,
  },
  savingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  publicIndicator: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  notesContainer: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brownText + '20',
    minHeight: 100,
  },
  notesInput: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  notesFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 20,
  },
  savingIndicator: {
    marginLeft: 8,
  },
  savingText: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  savedText: {
    fontSize: 11,
    fontFamily: typography.body,
    color: '#2FA463',
    fontWeight: '500',
  },
  tagsPreviewContainer: {
    minHeight: 44,
    justifyContent: 'center',
  },
  tagsChipsContainer: {
    marginBottom: 12,
    gap: 8,
  },
  tagsChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  tagPreviewChip: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagPreviewChipText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
  },
  tagMoreText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  customLabelPreviewChip: {
    backgroundColor: colors.brownText + '40',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  customLabelPreviewChipText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '500',
  },
});
