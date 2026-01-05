import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, typography } from '../config/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserBookCounts,
  getRecentUserBooks,
  UserBook,
  addBookToShelf,
  removeBookFromShelf,
} from '../services/books';
import { 
  getFollowerCount, 
  getFollowingCount,
  followUser,
  unfollowUser,
  checkIfFollowing,
} from '../services/userProfile';
import RecentActivityCard from '../components/RecentActivityCard';
import { supabase } from '../config/supabase';

// Add this to your navigation type definitions
type UserProfileRouteParams = {
  userId: string;
  username?: string; // Optional - for display while loading
};

export default function UserProfileScreen() {
  const { user: currentUser } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ params: UserProfileRouteParams }, 'params'>>();
  const { userId, username: initialUsername } = route.params;

  const [bookCounts, setBookCounts] = useState({
    read: 0,
    currently_reading: 0,
    want_to_read: 0,
  });
  const [recentBooks, setRecentBooks] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'activity' | 'profile'>('activity');
  const [viewerShelfMap, setViewerShelfMap] = useState<Record<string, { id: string; status: UserBook['status'] }>>({});
  const [userProfile, setUserProfile] = useState<{
    username: string;
    first_name: string;
    last_name: string;
    books_read_count: number;
    weekly_streak: number;
    global_rank: number | null;
    member_since: string | null;
    profile_photo_url: string | null;
    bio: string | null;
  } | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageActive, setMessageActive] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, [userId]);

  const loadUserProfile = async () => {
    try {
      setLoading(true);

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('username, first_name, last_name, books_read_count, weekly_streak, global_rank, member_since, profile_photo_url, bio')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        Alert.alert('Error', 'Could not load user profile');
        navigation.goBack();
        return;
      }

      setUserProfile(profile);

      // Fetch counts and recent activity in parallel
      const [counts, recent, followers, following] = await Promise.all([
        getUserBookCounts(userId),
        getRecentUserBooks(userId, 20),
        getFollowerCount(userId),
        getFollowingCount(userId),
      ]);

      setBookCounts(counts);
      setRecentBooks(recent);
      setFollowerCount(followers.count);
      setFollowingCount(following.count);

      if (currentUser?.id && recent.length > 0) {
        const bookIds = Array.from(new Set(recent.map((item) => item.book_id).filter(Boolean)));
        if (bookIds.length > 0) {
          const { data } = await supabase
            .from('user_books')
            .select('id, book_id, status')
            .eq('user_id', currentUser.id)
            .in('book_id', bookIds);
          const map: Record<string, { id: string; status: UserBook['status'] }> = {};
          (data || []).forEach((item: any) => {
            map[item.book_id] = { id: item.id, status: item.status };
          });
          setViewerShelfMap(map);
        } else {
          setViewerShelfMap({});
        }
      } else {
        setViewerShelfMap({});
      }

      // Check if current user is following this user
      if (currentUser?.id && currentUser.id !== userId) {
        const following = await checkIfFollowing(currentUser.id, userId);
        setIsFollowing(following);
      }

    } catch (error) {
      console.error('Error loading user profile:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser?.id || currentUser.id === userId) return;

    setFollowLoading(true);
    try {
      if (isFollowing) {
        const { error } = await unfollowUser(currentUser.id, userId);
        if (!error) {
          setIsFollowing(false);
          setFollowerCount(prev => Math.max(0, prev - 1));
        }
      } else {
        const { error } = await followUser(currentUser.id, userId);
        if (!error) {
          setIsFollowing(true);
          setFollowerCount(prev => prev + 1);
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  };

  const getJoinDate = () => {
    if (userProfile?.member_since) {
      const date = new Date(userProfile.member_since);
      const month = date.toLocaleString('default', { month: 'long' });
      const year = date.getFullYear();
      return `${month} ${year}`;
    }
    return 'Unknown';
  };

  const renderShelfSection = (
    iconSource: any,
    title: string,
    count: number,
    onPress?: () => void
  ) => (
    <TouchableOpacity style={styles.shelfCard} onPress={onPress} activeOpacity={0.7}>
      <Image
        source={iconSource}
        style={styles.shelfCardIcon}
        resizeMode="contain"
      />
      <Text style={styles.shelfCardTitle}>{title}</Text>
      <Text style={styles.shelfCardCount}>{count}</Text>
    </TouchableOpacity>
  );

  const renderStatCard = (iconSource: any, label: string, value: string) => (
    <View style={styles.statCard}>
      <Image
        source={iconSource}
        style={styles.statIcon}
        resizeMode="contain"
      />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );

  const getActionText = (status: string) => {
    const firstName = userProfile?.first_name || 'User';
    switch (status) {
      case 'read':
        return `${firstName} finished`;
      case 'currently_reading':
        return `${firstName} started reading`;
      case 'want_to_read':
        return `${firstName} bookmarked`;
      default:
        return `${firstName} added`;
    }
  };

  const formatDateForDisplay = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatDateRange = (startDate: string | null, endDate: string | null): string | null => {
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

  const handleBookPress = async (userBook: UserBook) => {
    if (!userBook.book) return;

    try {
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', userBook.book_id)
        .single();

      if (error) throw error;

      // Check if current user has this book
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

      // Navigate to BookDetailScreen
      (navigation as any).navigate('Search', {
        screen: 'BookDetail',
        params: {
          book: {
            ...fullBook,
            userBook: userBookData || null,
          },
        },
      });
    } catch (error) {
      console.error('Error loading book details:', error);
      Alert.alert('Error', 'Could not load book details');
    }
  };

  const renderRecentActivityItem = (userBook: UserBook) => (
    <RecentActivityCard
      key={userBook.id}
      userBook={userBook}
      actionText={getActionText(userBook.status)}
      avatarUrl={userProfile?.profile_photo_url}
      avatarFallback={userProfile?.username?.charAt(0).toUpperCase() || 'U'}
      onPressBook={handleBookPress}
      formatDateRange={formatDateRange}
      viewerStatus={viewerShelfMap[userBook.book_id]?.status || null}
      onToggleWantToRead={
        currentUser?.id ? () => handleToggleWantToRead(userBook) : undefined
      }
    />
  );

  const handleToggleWantToRead = async (userBook: UserBook) => {
    if (!currentUser?.id || !userBook.book || !userBook.book_id) return;
    const existing = viewerShelfMap[userBook.book_id];
    if (existing?.status === 'want_to_read') {
      await removeBookFromShelf(existing.id);
      setViewerShelfMap((prev) => {
        const next = { ...prev };
        delete next[userBook.book_id];
        return next;
      });
      return;
    }
    if (!existing) {
      const result = await addBookToShelf(userBook.book, 'want_to_read', currentUser.id);
      setViewerShelfMap((prev) => ({
        ...prev,
        [userBook.book_id]: { id: result.userBookId, status: 'want_to_read' },
      }));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  const isOwnProfile = currentUser?.id === userId;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>@{userProfile?.username || initialUsername}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {userProfile?.profile_photo_url ? (
              <Image
                source={{ uri: userProfile.profile_photo_url }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {userProfile?.username?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.username}>
            {userProfile?.first_name} {userProfile?.last_name}
          </Text>
          <Text style={styles.memberSince}>Member since {getJoinDate()}</Text>
          {userProfile?.bio && (
            <Text style={styles.bio}>{userProfile.bio}</Text>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statBox}
              onPress={() =>
                (navigation as any).navigate('FollowersFollowing', {
                  userId,
                  username: userProfile?.username || initialUsername,
                  initialTab: 'followers',
                })
              }
              activeOpacity={0.7}
            >
              <Text style={styles.statBoxValue}>{followerCount}</Text>
              <Text style={styles.statBoxLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statBox}
              onPress={() =>
                (navigation as any).navigate('FollowersFollowing', {
                  userId,
                  username: userProfile?.username || initialUsername,
                  initialTab: 'following',
                })
              }
              activeOpacity={0.7}
            >
              <Text style={styles.statBoxValue}>{followingCount}</Text>
              <Text style={styles.statBoxLabel}>Following</Text>
            </TouchableOpacity>
            <View style={styles.statBox}>
              <Text style={styles.statBoxValue}>
                {userProfile?.global_rank ? `#${userProfile.global_rank}` : '--'}
              </Text>
              <Text style={styles.statBoxLabel}>Rank</Text>
            </View>
          </View>

          {/* Action Buttons */}
          {!isOwnProfile && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[
                  styles.followButton,
                  isFollowing && styles.followingButton
                ]}
                onPress={handleFollowToggle}
                disabled={followLoading}
              >
                {followLoading ? (
                  <ActivityIndicator size="small" color={isFollowing ? colors.brownText : colors.white} />
                ) : (
                  <Text style={[
                    styles.followButtonText,
                    isFollowing && styles.followingButtonText
                  ]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.followButton,
                  messageActive && styles.followingButton
                ]}
              >
                <Text
                  style={[
                    styles.followButtonText,
                    messageActive && styles.followingButtonText
                  ]}
                >
                  Message
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Shelf Sections */}
        <View style={styles.shelfCardsContainer}>
          {renderShelfSection(
            require('../../assets/add.png'),
            'Read',
            bookCounts.read,
            () => (navigation as any).navigate('UserShelf', {
              userId,
              username: userProfile?.username,
              initialTab: 'read',
            })
          )}
          {renderShelfSection(
            require('../../assets/reading.png'),
            'Currently Reading',
            bookCounts.currently_reading,
            () => (navigation as any).navigate('UserShelf', {
              userId,
              username: userProfile?.username,
              initialTab: 'currently_reading',
            })
          )}
          {renderShelfSection(
            require('../../assets/bookmark.png'),
            'Want to Read',
            bookCounts.want_to_read,
            () => (navigation as any).navigate('UserShelf', {
              userId,
              username: userProfile?.username,
              initialTab: 'want_to_read',
            })
          )}
        </View>

        {/* Stats Cards */}
        <View style={styles.statsCardsRow}>
          {renderStatCard(
            require('../../assets/rank.png'),
            'Rank on Inkli',
            userProfile?.global_rank ? `#${userProfile.global_rank}` : '--'
          )}
          {renderStatCard(
            require('../../assets/fire.png'),
            'Weekly Streak',
            `${userProfile?.weekly_streak ?? 0} weeks`
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'activity' && styles.tabActive]}
            onPress={() => setActiveTab('activity')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'activity' && styles.tabTextActive,
              ]}
            >
              Recent Activity
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
            onPress={() => setActiveTab('profile')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'profile' && styles.tabTextActive,
              ]}
            >
              Taste Profile
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'activity' && (
            <View style={styles.activityContent}>
              {recentBooks.length > 0 ? (
                recentBooks.map((book) => renderRecentActivityItem(book))
              ) : (
                <Text style={styles.emptyText}>No recent activity</Text>
              )}
            </View>
          )}
          {activeTab === 'profile' && (
            <View style={styles.profileContent}>
              <Text style={styles.emptyText}>Taste profile coming soon</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Copy all styles from ProfileScreen.tsx and add these new ones:
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: colors.primaryBlue,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 40,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  username: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberSince: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.8,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  statBox: {
    alignItems: 'center',
  },
  statBoxValue: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 4,
  },
  statBoxLabel: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    paddingHorizontal: 16,
  },
  followButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primaryBlue,
  },
  followButtonText: {
    fontSize: 14,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  followingButtonText: {
    color: colors.primaryBlue,
  },
  // ... copy all other styles from ProfileScreen.tsx ...
  shelfCardsContainer: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  shelfCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shelfCardIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    tintColor: colors.brownText,
  },
  shelfCardTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  shelfCardCount: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  statsCardsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statIcon: {
    width: 32,
    height: 32,
    marginBottom: 8,
    tintColor: colors.brownText,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  tab: {
    flex: 1,
    paddingBottom: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primaryBlue,
  },
  tabText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
  },
  tabTextActive: {
    color: colors.primaryBlue,
    opacity: 1,
    fontWeight: '600',
  },
  tabContent: {
    padding: 16,
  },
  activityContent: {
    gap: 16,
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
  cardAvatarText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardActionText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  cardBookTitle: {
    fontWeight: '700',
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
  scoreText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '700',
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
    aspectRatio: 2/3,
    borderRadius: 4,
    marginRight: 12,
  },
  bookInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  bookTextInfo: {
    flex: 1,
    marginRight: 8,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 4,
    fontWeight: '600',
  },
  bookAuthor: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 8,
  },
  cardDetailsSection: {
    marginTop: 12,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  cardDetailsSectionWithNotes: {
    marginBottom: 4,
  },
  cardDetailsSectionFollowing: {
    marginTop: 4,
  },
  cardDetailsText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    flexWrap: 'wrap',
  },
  cardDetailsLabel: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '700',
  },
  cardDetailsValue: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.8,
  },
  cardTimestamp: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    marginTop: 8,
    opacity: 0.6,
  },
  profileContent: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    textAlign: 'center',
  },
});
