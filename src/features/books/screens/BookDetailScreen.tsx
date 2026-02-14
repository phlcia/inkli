import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../../../config/theme';
import { BookCoverPlaceholder } from '../components/BookCoverPlaceholder';
import { addBookToShelf, checkUserHasBook, removeBookFromShelf, updateBookStatus, redistributeRanksForRating, formatCount, UserBook, getReadSessions, BookShelfCounts } from '../../../services/books';
import { useAuth } from '../../../contexts/AuthContext';
import { useErrorHandler } from '../../../contexts/ErrorHandlerContext';
import { supabase } from '../../../config/supabase';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import ReadingProgressSlider from '../components/ReadingProgressSlider';
import FriendsRankingsSection from '../components/FriendsRankingsSection';
import BookThoughtsSection from '../components/BookThoughtsSection';
import BookFeedbackForm from '../components/BookFeedbackForm';
import { useBookStats } from '../hooks/useBookStats';
import { useFriendsRankings } from '../hooks/useFriendsRankings';
import { useBookThoughts } from '../hooks/useBookThoughts';
import addIcon from '../../../../assets/add.png';
import readingIcon from '../../../../assets/reading.png';
import bookmarkIcon from '../../../../assets/bookmark.png';

type BookDetailScreenRouteProp = RouteProp<SearchStackParamList, 'BookDetail'>;
type BookDetailScreenNavigationProp = NativeStackNavigationProp<SearchStackParamList, 'BookDetail'>;

export default function BookDetailScreen() {
  const navigation = useNavigation<BookDetailScreenNavigationProp>();
  const route = useRoute<BookDetailScreenRouteProp>();
  const { user } = useAuth();
  const { handleApiError, showClientError } = useErrorHandler();
  const { book } = route.params;

  const [currentStatus, setCurrentStatus] = useState<
    'read' | 'currently_reading' | 'want_to_read' | null
  >(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [animatedIcon, setAnimatedIcon] = useState<string | null>(null);
  const [userRankScore, setUserRankScore] = useState<number | null>(null);
  const friendsRankingsSectionRef = useRef<View>(null);
  const refreshBookStatusRef = useRef<() => void>(() => {});

  // "What you think" section state
  const [userBookId, setUserBookId] = useState<string | null>(null);
  const [readingProgress, setReadingProgress] = useState<number>(0);
  const [showRankingActionSheet, setShowRankingActionSheet] = useState(false);
  const [resolvedBookId, setResolvedBookId] = useState<string | null>(book.id || null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

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

  const {
    circleStats,
    circleLoading,
    circleError,
    shelfCounts,
    setShelfCounts,
    refreshShelfCounts,
  } = useBookStats({
    resolveBookIdForStats,
    userId: user?.id,
  });

  const {
    friendsRankings,
    friendsRankingsLoading,
    friendsRankingsError,
    friendsRankingsTotalCount,
    handleRetryFriendsRankings,
    handleShowMoreFriendsRankings,
  } = useFriendsRankings({
    resolveBookIdForStats,
    userId: user?.id,
    bookCacheKey: `${book.id || ''}-${book.open_library_id || ''}-${book.google_books_id || ''}`,
  });

  const {
    userNotes,
    userCustomLabels,
    readSessions,
    savingNotes,
    savingDates,
    notesSaved,
    showDateRangePickerModal,
    editingSessionId,
    showGenreLabelPicker,
    savingTags,
    customLabelSuggestions,
    effectiveGenres,
    sortedSessions,
    setReadSessions,
    hydrateThoughtsFromUserBook,
    resetThoughts,
    handleNotesChange,
    handleNotesBlur,
    openDateRangePicker,
    openDateRangePickerForEdit,
    handleDateRangeSelected,
    handleDeleteReadSession,
    handleRemoveGenre,
    handleRemoveCustomLabel,
    handleSaveTags,
    setShowDateRangePickerModal,
    setShowGenreLabelPicker,
    setEditingSessionId,
  } = useBookThoughts({
    user,
    book,
    userBookId,
    setUserBookId,
    refreshBookStatusRef,
  });

  // Check if book already exists in user's shelf and fetch notes/dates
  const refreshBookStatus = React.useCallback(async () => {
    if (!user || (!book.open_library_id && !book.google_books_id)) {
      return;
    }

    try {
      // First, check if book exists in books table and get its genres
      let existingBook: { id: string; genres?: string[] } | null = null;
      if (book.open_library_id) {
        const { data } = await supabase
          .from('books')
          .select('id, genres')
          .eq('open_library_id', book.open_library_id)
          .single();
        existingBook = data;
      }
      
      if (!existingBook && book.google_books_id) {
        const { data } = await supabase
          .from('books')
          .select('id, genres')
          .eq('google_books_id', book.google_books_id)
          .single();
        existingBook = data;
      }

      if (existingBook) {
        // Store the resolved book ID
        setResolvedBookId(existingBook.id);

        const { data } = await supabase
          .from('user_books')
          .select('id, status, rank_score, notes, custom_labels, user_genres, progress_percent')
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
          hydrateThoughtsFromUserBook(data);
          setReadingProgress(data.progress_percent ?? 0);
          
          // Fetch read sessions
          try {
            const sessions = await getReadSessions(data.id);
            setReadSessions(sessions);
          } catch (_error) {
            console.error('Error fetching read sessions:', _error);
            setReadSessions([]);
          }
        } else {
          setCurrentStatus(null);
          setUserRankScore(null);
          setUserBookId(null);
          resetThoughts();
          setReadingProgress(0);
        }
      } else {
        setCurrentStatus(null);
        setUserRankScore(null);
        setUserBookId(null);
        resetThoughts();
        setReadingProgress(0);
      }
    } catch (_error) {
      // Book doesn't exist yet, that's fine
      setCurrentStatus(null);
      setUserRankScore(null);
      setUserBookId(null);
      resetThoughts();
    }
  }, [
    user,
    book.open_library_id,
    book.google_books_id,
    hydrateThoughtsFromUserBook,
    resetThoughts,
    setReadSessions,
  ]);

  refreshBookStatusRef.current = refreshBookStatus;

  useEffect(() => {
    refreshBookStatus();
  }, [refreshBookStatus]);

  // Refresh status when returning from BookRanking screen
  useFocusEffect(
    React.useCallback(() => {
      refreshBookStatus();
    }, [refreshBookStatus])
  );

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

  const handleReadIconPress = async () => {
    if (!user) {
      showClientError('You must be logged in to add books');
      return;
    }

    if (loading) return;

    if (currentStatus !== 'read' || !userBookId) {
      await handleIconPress('read');
      return;
    }

    if (userRankScore === null) {
      navigation.navigate('BookRanking', {
        book,
        userBookId,
        initialStatus: 'read',
        previousStatus: currentStatus,
        wasNewBook: false,
      });
      return;
    }

    setShowRankingActionSheet(true);
  };

  const handleRankNewInstance = () => {
    if (!userBookId) return;
    setShowRankingActionSheet(false);
    navigation.navigate('BookRanking', {
      book,
      userBookId,
      initialStatus: 'read',
      previousStatus: currentStatus,
      wasNewBook: false,
      isNewInstance: true,
    });
  };

  const handleReorderWithinShelf = () => {
    setShowRankingActionSheet(false);
    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('Your Shelf' as never, { screen: 'ReorderShelf' } as never);
    } else {
      (navigation as any).navigate('ReorderShelf');
    }
  };

  const handleRemoveFromShelf = async () => {
    if (!userBookId) return;
    setShowRankingActionSheet(false);

    Alert.alert(
      'Remove from Shelf',
      `This will remove "${book.title}" from your read shelf. Your reading history and notes will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading('read');
              updateShelfCountsOptimistically('read', null);
              setCurrentStatus(null);
              setUserRankScore(null);
              const { error } = await updateBookStatus(userBookId, null, {
                clearRankScore: true,
                touchUpdatedAt: true,
              });
              if (error) {
                throw error;
              }
              void refreshShelfCounts();
            } catch (error: any) {
              handleApiError(error, 'remove from shelf', () => {
                updateBookStatus(userBookId, null, {
                  clearRankScore: true,
                  touchUpdatedAt: true,
                }).then(({ error }) => {
                  if (!error) void refreshShelfCounts();
                });
              });
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleIconPress = async (status: 'read' | 'currently_reading' | 'want_to_read') => {
    if (!user) {
      showClientError('You must be logged in to add books');
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
            showClientError("Book not found on shelf");
          }
        } else {
          rollbackOptimisticUpdate();
          showClientError('Book not found');
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
        const result = await addBookToShelf(book, status, user.id);
        
        
        if (!result.userBookId || result.userBookId === '') {
          rollbackOptimisticUpdate();
          showClientError('Failed to add book - missing book ID');
          setLoading(null);
          return;
        }
        
        const isUpdate = result.isUpdate && currentStatus !== null;
        
        setCurrentStatus(status);
        setUserRankScore(null);
        
        // Only open ranking screen if status is 'read'
        if (status === 'read') {
          // Navigate to BookRankingScreen after adding the book
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
    } catch (error) {
      rollbackOptimisticUpdate();
      handleApiError(error, 'update book', () => handleIconPress(status));
      setLoading(null);
    } finally {
      // Keep animated icon for visual feedback
      setTimeout(() => setAnimatedIcon(null), 800);
    }
  };

  const isIconActive = (status: 'read' | 'currently_reading' | 'want_to_read') => {
    return currentStatus === status;
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
      handleApiError(error, 'load book');
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

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
                onPress={handleReadIconPress}
                disabled={Boolean(loading)}
              >
                <Image
                  source={addIcon}
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
                  source={readingIcon}
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
                  source={bookmarkIcon}
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

        {currentStatus === 'currently_reading' && user?.id && (resolvedBookId || book.id) && (
          <View style={styles.progressSection}>
            <ReadingProgressSlider
              userId={user.id}
              bookId={(resolvedBookId || book.id) as string}
              initialProgress={readingProgress}
              onProgressChange={(progress) => {
                setReadingProgress(progress);
                void refreshBookStatus();
                if (progress >= 100 && currentStatus === 'currently_reading') {
                  void handleIconPress('read');
                }
              }}
              disabled={Boolean(loading)}
            />
          </View>
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
          <TouchableOpacity
            style={styles.reportLink}
            onPress={() => setShowFeedbackForm(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.reportLinkText}>Report incorrect info</Text>
          </TouchableOpacity>
        </View>

        <BookThoughtsSection
          user={user}
          book={book}
          userBookId={userBookId}
          resolvedBookId={resolvedBookId}
          effectiveGenres={effectiveGenres}
          userCustomLabels={userCustomLabels}
          sortedSessions={sortedSessions}
          readSessions={readSessions}
          savingTags={savingTags}
          savingDates={savingDates}
          savingNotes={savingNotes}
          notesSaved={notesSaved}
          customLabelSuggestions={customLabelSuggestions}
          showDateRangePickerModal={showDateRangePickerModal}
          showGenreLabelPicker={showGenreLabelPicker}
          editingSessionId={editingSessionId}
          userNotes={userNotes}
          styles={styles}
          onShowGenreLabelPicker={() => setShowGenreLabelPicker(true)}
          onHideGenreLabelPicker={() => setShowGenreLabelPicker(false)}
          onShowDateRangePicker={openDateRangePicker}
          onHideDateRangePicker={() => setShowDateRangePickerModal(false)}
          onDateRangeSelected={handleDateRangeSelected}
          onOpenDateRangePickerForEdit={openDateRangePickerForEdit}
          onDeleteReadSession={handleDeleteReadSession}
          onNotesChange={handleNotesChange}
          onNotesBlur={handleNotesBlur}
          onRemoveGenre={handleRemoveGenre}
          onRemoveCustomLabel={handleRemoveCustomLabel}
          onSaveTags={handleSaveTags}
          onClearEditingSession={() => setEditingSessionId(null)}
        />

        <FriendsRankingsSection
          friendsRankings={friendsRankings}
          friendsRankingsLoading={friendsRankingsLoading}
          friendsRankingsError={friendsRankingsError}
          friendsRankingsTotalCount={friendsRankingsTotalCount}
          onRetry={handleRetryFriendsRankings}
          onShowMore={handleShowMoreFriendsRankings}
          onPressUser={(userId, username) =>
            navigation.navigate('UserProfile', {
              userId,
              username,
            })
          }
          onPressBook={handleFriendBookPress}
          viewerStatus={currentStatus}
          onToggleWantToRead={() => handleIconPress('want_to_read')}
          sectionRef={friendsRankingsSectionRef}
          styles={styles}
          FriendsRankingSkeletonCard={FriendsRankingSkeletonCard}
          loadingIndicatorColor={colors.white}
        />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showRankingActionSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRankingActionSheet(false)}
      >
        <View style={styles.actionSheetOverlay}>
          <TouchableOpacity
            style={styles.actionSheetBackdrop}
            activeOpacity={1}
            onPress={() => setShowRankingActionSheet(false)}
          />
          <View style={styles.actionSheet}>
            <SafeAreaView edges={['bottom']}>
              <View style={styles.actionSheetContent}>
                <Text style={styles.actionSheetTitle}>Ranked Shelf Options</Text>

                <TouchableOpacity
                  style={styles.actionSheetButton}
                  onPress={handleRankNewInstance}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionSheetButtonText}>Rank new reading instance</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionSheetButton}
                  onPress={handleReorderWithinShelf}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionSheetButtonText}>Reorder within shelf</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionSheetButton}
                  onPress={handleRemoveFromShelf}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionSheetButtonText, styles.actionSheetDestructiveText]}>
                    Remove from shelf
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionSheetButton, styles.actionSheetCancelButton]}
                  onPress={() => setShowRankingActionSheet(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionSheetButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </View>
      </Modal>

      <BookFeedbackForm
        visible={showFeedbackForm}
        onClose={() => setShowFeedbackForm(false)}
        bookId={(resolvedBookId ?? book.id ?? book.open_library_id ?? book.google_books_id ?? '') as string}
        bookTitle={book.title}
      />
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
  keyboardAvoidingView: {
    flex: 1,
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
    paddingBottom: 200,
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
  progressSection: {
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
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
  reportLink: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryBlue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportLinkText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  toastWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toast: {
    backgroundColor: colors.brownText,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
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
  // Unified shelf chips (for both genres and custom labels)
  shelfChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 8,
  },
  shelfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBlue,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 16,
  },
  shelfChipText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
    marginRight: 6,
  },
  shelfChipClose: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shelfChipCloseText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  actionSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  actionSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  actionSheet: {
    backgroundColor: colors.creamBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  actionSheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  actionSheetTitle: {
    fontSize: 20,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 16,
  },
  actionSheetButton: {
    paddingVertical: 14,
  },
  actionSheetButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  actionSheetDestructiveText: {
    color: '#D24B4B',
  },
  actionSheetCancelButton: {
    marginTop: 8,
  },
});
