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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../../../config/theme';
import { BookCoverPlaceholder } from '../components/BookCoverPlaceholder';
import { addBookToShelf, checkUserHasBook, getBookCircles, getBookShelfCounts, removeBookFromShelf, getFriendsRankingsForBook, updateBookStatus, BookCirclesResult, BookShelfCounts, formatCount, UserBook } from '../../../services/books';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../config/supabase';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import RecentActivityCard from '../../social/components/RecentActivityCard';

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
        const { data } = await supabase
          .from('user_books')
          .select('status, rank_score')
          .eq('user_id', user.id)
          .eq('book_id', existingBook.id)
          .single();

        if (data?.status) {
          setCurrentStatus(data.status as 'read' | 'currently_reading' | 'want_to_read');
        } else {
          setCurrentStatus(null);
        }
        setUserRankScore(data?.rank_score ?? null);
      } else {
        setCurrentStatus(null);
        setUserRankScore(null);
      }
    } catch (error) {
      // Book doesn't exist yet, that's fine
      console.log('Book not in shelf yet');
      setCurrentStatus(null);
      setUserRankScore(null);
    }
  }, [user, book.open_library_id, book.google_books_id]);

  useEffect(() => {
    refreshBookStatus();
  }, [refreshBookStatus]);

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
        next[fromStatus] = Math.max(0, next[fromStatus] - 1);
      }

      if (toStatus) {
        next[toStatus] += 1;
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
            const { error } = shouldKeepDetails
              ? await updateBookStatus(checkResult.userBookId, null, { clearRankScore: true })
              : await removeBookFromShelf(checkResult.userBookId);
            
            if (error) {
              throw error;
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

  const metadata = [
    book.page_count ? `${book.page_count} pages` : null,
    book.published_date ? book.published_date : null,
  ]
    .filter(Boolean)
    .join(' • ');

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

        {/* Title */}
        <Text style={styles.title}>{book.title}</Text>

        {/* Author */}
        <Text style={styles.author}>
          {book.authors?.join(', ') || 'Unknown Author'}
        </Text>

        {/* Quick Action Icons */}
        <View style={styles.actionIconsContainer}>
          {/* Add to Read */}
          <View style={styles.actionIconWrapper}>
            <TouchableOpacity
              style={[
                styles.actionIcon,
                isIconActive('read') && styles.actionIconActive,
              ]}
              onPress={() => handleIconPress('read')}
              disabled={Boolean(loading)}
            >
              <Image
                source={require('../../../../assets/add.png')}
                style={[
                  styles.actionIconImage,
                  isIconActive('read') && styles.actionIconImageActive,
                ]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          {/* Currently Reading */}
          <View style={styles.actionIconWrapper}>
            <TouchableOpacity
              style={[
                styles.actionIcon,
                isIconActive('currently_reading') && styles.actionIconActive,
              ]}
              onPress={() => handleIconPress('currently_reading')}
              disabled={Boolean(loading)}
            >
              <Image
                source={require('../../../../assets/reading.png')}
                style={[
                  styles.actionIconImage,
                  isIconActive('currently_reading') && styles.actionIconImageActive,
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
              style={[
                styles.actionIcon,
                isIconActive('want_to_read') && styles.actionIconActive,
              ]}
              onPress={() => handleIconPress('want_to_read')}
              disabled={Boolean(loading)}
            >
              <Image
                source={require('../../../../assets/bookmark.png')}
                style={[
                  styles.actionIconImage,
                  isIconActive('want_to_read') && styles.actionIconImageActive,
                ]}
                resizeMode="contain"
              />
            </TouchableOpacity>
            {shelfCounts && shelfCounts.want_to_read > 0 && (
              <ShelfCountStack count={shelfCounts.want_to_read} />
            )}
          </View>
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

        {/* Rating Circles */}
        <View style={styles.circlesSection}>
          <View style={[
            styles.circlesRow,
            hasUserCircle && styles.circlesRowCompact,
            !hasUserCircle && styles.circlesRowTwo,
          ]}>
            {userRankScore !== null && (
              <View style={[styles.circleCard, styles.circleCardCompact, styles.circleCardUser, styles.circleCardUserCompact]}>
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
            <View style={[styles.circleCard, hasUserCircle && styles.circleCardCompact, styles.circleCardGlobal, hasUserCircle && styles.circleCardGlobalCompact]}>
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
            <View style={[styles.circleCard, hasUserCircle && styles.circleCardCompact, styles.circleCardFriends, hasUserCircle && styles.circleCardFriendsCompact]}>
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
          </View>
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
  actionIconWrapper: {
    position: 'relative',
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
  circlesSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  circlesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  circlesRowCompact: {
    justifyContent: 'center',
  },
  circlesRowTwo: {
    paddingLeft: 40,
  },
  circleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 170,
    justifyContent: 'flex-start',
  },
  circleCardCompact: {
    width: 122,
  },
  circleCardUser: {
    marginRight: -8,
    zIndex: 3,
  },
  circleCardUserCompact: {
    marginRight: 0,
  },
  circleCardGlobal: {
    marginRight: -8,
    zIndex: 2,
  },
  circleCardGlobalCompact: {
    marginRight: 0,
  },
  circleCardFriends: {
    marginLeft: -18,
    zIndex: 1,
  },
  circleCardFriendsCompact: {
    marginLeft: 0,
  },
  ratingCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    marginLeft: 6,
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
});
