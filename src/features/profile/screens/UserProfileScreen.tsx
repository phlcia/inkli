import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getUserBookCounts,
  getRecentUserBooks,
  UserBook,
} from '../../../services/books';
import { fetchBookWithUserStatus } from '../../../services/bookDetails';
import { 
  getFollowerCount, 
  getFollowingCount,
  checkIfFollowing,
  checkIfMuted,
  checkPendingFollowRequest,
  getBlockStatus,
} from '../../../services/userProfile';
import type { AccountType } from '../../../services/userProfile';
import RecentActivityCard from '../../social/components/RecentActivityCard';
import { supabase } from '../../../config/supabase';
import { formatDateRange } from '../../../utils/dateRanges';
import { getActionText } from '../../../utils/activityText';
import { ProfileShelfCard, ProfileStatCard } from '../components/ProfileCards';
import ProfileInfoSection from '../components/ProfileInfoSection';
import { useToggleWantToRead } from '../../books/hooks/useToggleWantToRead';
import { useFollowActions } from '../hooks/useFollowActions';
import FollowMenuActions from '../components/FollowMenuActions';
import ProfileHeader from '../components/ProfileHeader';
import addIcon from '../../../../assets/add.png';
import readingIcon from '../../../../assets/reading.png';
import bookmarkIcon from '../../../../assets/bookmark.png';
import rankIcon from '../../../../assets/rank.png';
import fireIcon from '../../../../assets/fire.png';

// Add this to your navigation type definitions
type UserProfileRouteParams = {
  userId: string;
  username?: string; // Optional - for display while loading
  originTab?: string;
};

export default function UserProfileScreen() {
  const { user: currentUser } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: UserProfileRouteParams }, 'params'>>();
  const { userId, username: initialUsername } = route.params;

  const [bookCounts, setBookCounts] = useState({
    read: 0,
    currently_reading: 0,
    want_to_read: 0,
  });
  const [recentBooks, setRecentBooks] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const [isFollowedByTarget, setIsFollowedByTarget] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followMenuOpen, setFollowMenuOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>('public');
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [blockedByViewer, setBlockedByViewer] = useState(false);
  const [blockedByTarget, setBlockedByTarget] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const handleToggleWantToRead = useToggleWantToRead({
    currentUserId: currentUser?.id,
    viewerShelfMap,
    setViewerShelfMap,
  });

  const loadUserProfile = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      if (currentUser?.id && currentUser.id !== userId) {
        const blockStatus = await getBlockStatus(currentUser.id, userId);
        setBlockedByViewer(blockStatus.blockedByViewer);
        setBlockedByTarget(blockStatus.blockedByTarget);
        if (blockStatus.blockedByTarget) {
          setUserProfile(null);
          setLoading(false);
          return;
        }
      }

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('username, first_name, last_name, books_read_count, weekly_streak, global_rank, member_since, profile_photo_url, bio, account_type')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        Alert.alert('Error', 'Could not load user profile');
        navigation.goBack();
        return;
      }

      setUserProfile(profile);
      setAccountType((profile?.account_type || 'public') as AccountType);

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
        const [following, pending, muted, followedByTarget] = await Promise.all([
          checkIfFollowing(currentUser.id, userId),
          checkPendingFollowRequest(currentUser.id, userId),
          checkIfMuted(currentUser.id, userId),
          checkIfFollowing(userId, currentUser.id),
        ]);
        setIsFollowing(following);
        setFollowRequestPending(pending);
      setIsMuted(muted);
      setIsFollowedByTarget(followedByTarget);
    }

  } catch (error) {
    console.error('Error loading user profile:', error);
    Alert.alert('Error', 'Failed to load profile data');
  } finally {
    if (showLoading) {
      setLoading(false);
    }
  }
  }, [currentUser?.id, navigation, userId]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUserProfile(false);
    } finally {
      setRefreshing(false);
    }
  };

  const {
    handleFollowToggle,
    handleMutePress,
    handleBlockPress,
    handleConfirmBlock,
  } = useFollowActions({
    currentUserId: currentUser?.id,
    targetUserId: userId,
    isFollowing,
    followRequestPending,
    blockedByViewer,
    isMuted,
    isFollowedByTarget,
    setIsFollowing,
    setFollowRequestPending,
    setFollowMenuOpen,
    setBlockedByViewer,
    setIsMuted,
    setIsFollowedByTarget,
    setFollowerCount,
    setFollowingCount,
    setFollowLoading,
    onError: (message) => Alert.alert('Error', message),
  });

  const getJoinDate = () => {
    if (userProfile?.member_since) {
      const date = new Date(userProfile.member_since);
      const month = date.toLocaleString('default', { month: 'long' });
      const year = date.getFullYear();
      return `${month} ${year}`;
    }
    return 'Unknown';
  };

  const isPrivateLocked =
    accountType === 'private' &&
    !isFollowing &&
    currentUser?.id !== userId;

  const followLabel = isFollowing
    ? 'Following'
    : followRequestPending
      ? 'Requested'
      : blockedByViewer
        ? 'Unblock'
        : isFollowedByTarget
          ? 'Follow back'
          : accountType === 'private'
            ? 'Follow'
            : 'Follow';

  const handleBlockPressWithConfirm = () => {
    if (!currentUser?.id || currentUser.id === userId) return;
    if (blockedByViewer) {
      handleBlockPress();
      return;
    }
    Alert.alert('Block user?', 'They will not be able to view your profile or activity.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: handleConfirmBlock,
      },
    ]);
  };

  const handleBookPress = async (userBook: UserBook) => {
    if (!userBook.book) return;

    try {
      const { book, userBook: userBookData } = await fetchBookWithUserStatus(
        userBook.book_id,
        currentUser?.id
      );

      // Navigate to BookDetailScreen
      (navigation as any).navigate('Search', {
        screen: 'BookDetail',
        params: {
          book: {
            ...book,
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
      actionText={getActionText({
        status: userBook.status,
        displayName: userProfile?.first_name || 'User',
        hasProgressUpdate: !!userBook.last_progress_update,
        progressPercent: userBook.progress_percent,
      })}
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

  if (blockedByTarget) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyStateTitle}>User unavailable</Text>
          <Text style={styles.emptyStateText}>This profile is not available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ProfileHeader
        title={`@${userProfile?.username || initialUsername}`}
        onBack={() => {
          const originTab = route.params?.originTab;
          if (originTab) {
            const state = navigation.getState?.();
            if (state?.type === 'stack' && state.routes.length > 1) {
              navigation.popToTop();
            }
            const parent = navigation.getParent();
            if (parent) {
              parent.navigate(originTab);
              return;
            }
          }
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
        }}
        styles={styles}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primaryBlue}
          />
        }
      >
        {/* Profile Section */}
        <ProfileInfoSection
          profilePhotoUrl={userProfile?.profile_photo_url}
          avatarFallback={userProfile?.username?.charAt(0).toUpperCase() || 'U'}
          displayName={`${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim()}
          memberSinceLabel={`Member since ${getJoinDate()}`}
          bio={userProfile?.bio}
          showStats={!isPrivateLocked}
          stats={{
            followers: followerCount,
            following: followingCount,
            rankLabel: userProfile?.global_rank ? `#${userProfile.global_rank}` : '--',
            onPressFollowers: () =>
              (navigation as any).navigate('FollowersFollowing', {
                userId,
                username: userProfile?.username || initialUsername,
                initialTab: 'followers',
              }),
            onPressFollowing: () =>
              (navigation as any).navigate('FollowersFollowing', {
                userId,
                username: userProfile?.username || initialUsername,
                initialTab: 'following',
              }),
          }}
        >
          {/* Action Buttons */}
          {!isOwnProfile && (
            <FollowMenuActions
              followLoading={followLoading}
              isFollowing={isFollowing}
              followRequestPending={followRequestPending}
              followLabel={followLabel}
              isMuted={isMuted}
              blockedByViewer={blockedByViewer}
              followMenuOpen={followMenuOpen}
              onToggleFollow={handleFollowToggle}
              onToggleMenu={() => setFollowMenuOpen((prev) => !prev)}
              onMutePress={handleMutePress}
              onBlockPress={handleBlockPressWithConfirm}
              styles={styles}
            />
          )}
        </ProfileInfoSection>

        {!isPrivateLocked && (
          <>
            {/* Shelf Sections */}
            <View style={styles.shelfCardsContainer}>
              <ProfileShelfCard
                iconSource={addIcon}
                title="Read"
                count={bookCounts.read}
                onPress={() => {
                  const parentNav = (navigation as any).getParent?.();
                  const target = {
                    screen: 'UserShelf',
                    params: {
                      userId,
                      username: userProfile?.username,
                      initialTab: 'read',
                    },
                  };
                  if (parentNav?.navigate) {
                    parentNav.navigate('Home', target);
                    return;
                  }
                  (navigation as any).navigate('Home', target);
                }}
              />
              <ProfileShelfCard
                iconSource={readingIcon}
                title="Currently Reading"
                count={bookCounts.currently_reading}
                onPress={() => {
                  const parentNav = (navigation as any).getParent?.();
                  const target = {
                    screen: 'UserShelf',
                    params: {
                      userId,
                      username: userProfile?.username,
                      initialTab: 'currently_reading',
                    },
                  };
                  if (parentNav?.navigate) {
                    parentNav.navigate('Home', target);
                    return;
                  }
                  (navigation as any).navigate('Home', target);
                }}
              />
              <ProfileShelfCard
                iconSource={bookmarkIcon}
                title="Want to Read"
                count={bookCounts.want_to_read}
                onPress={() => {
                  const parentNav = (navigation as any).getParent?.();
                  const target = {
                    screen: 'UserShelf',
                    params: {
                      userId,
                      username: userProfile?.username,
                      initialTab: 'want_to_read',
                    },
                  };
                  if (parentNav?.navigate) {
                    parentNav.navigate('Home', target);
                    return;
                  }
                  (navigation as any).navigate('Home', target);
                }}
              />
            </View>

            {/* Stats Cards */}
            <View style={styles.statsCardsRow}>
              <ProfileStatCard
                iconSource={rankIcon}
                label="Rank on Inkli"
                value={userProfile?.global_rank ? `#${userProfile.global_rank}` : '--'}
              />
              <ProfileStatCard
                iconSource={fireIcon}
                label="Weekly Streak"
                value={`${userProfile?.weekly_streak ?? 0} weeks`}
              />
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
            </View>
          </>
        )}
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
    marginTop: Platform.OS === 'ios' ? 8 : 16,
    marginLeft: 0,
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
  headerLeftSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  followGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    width: '100%',
  },
  followButton: {
    flex: 1,
    height: 40,
    paddingVertical: 0,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.white,
  },
  followButtonConnected: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  followingButton: {
    backgroundColor: colors.white,
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
  followMenuTrigger: {
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.white,
    borderLeftWidth: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBlue,
  },
  followMenuTriggerText: {
    fontSize: 14,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  followMenuTriggerIcon: {
    width: 12,
    height: 12,
    tintColor: colors.white,
  },
  followMenuTriggerIconFollowing: {
    tintColor: colors.primaryBlue,
  },
  followMenu: {
    position: 'absolute',
    top: 44,
    right: 0,
    backgroundColor: colors.primaryBlue,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.brownText}1A`,
    paddingVertical: 6,
    minWidth: 140,
    zIndex: 10,
    shadowColor: colors.brownText,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  followMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  followMenuItemText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.white,
  },
  // ... copy all other styles from ProfileScreen.tsx ...
  shelfCardsContainer: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  statsCardsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
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
  privateNotice: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    textAlign: 'center',
  },
  privateBadge: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.primaryBlue,
    marginTop: 4,
  },
});
