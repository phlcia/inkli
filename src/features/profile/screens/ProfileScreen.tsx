import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useErrorHandler } from '../../../contexts/ErrorHandlerContext';
import {
  getUserBookCounts,
  UserBook,
} from '../../../services/books';
import { fetchBookWithUserStatus } from '../../../services/bookDetails';
import { fetchUserActivityCards } from '../../../services/activityFeed';
import { ActivityFeedItem } from '../../../types/activityCards';
import { formatDateRange } from '../../../utils/dateRanges';
import { getActionText } from '../../../utils/activityText';
import { useToggleWantToRead } from '../../books/hooks/useToggleWantToRead';
import {
  acceptFollowRequest,
  getBlockedUsers,
  getFollowerCount,
  getFollowingCount,
  getIncomingFollowRequests,
  getMutedUsers,
  rejectFollowRequest,
  unblockUser,
  unmuteUser,
} from '../../../services/userProfile';
import type { UserSummary } from '../../../services/userProfile';
import RecentActivityCard from '../../social/components/RecentActivityCard';
import { supabase } from '../../../config/supabase';
import { ProfileShelfCard, ProfileStatCard } from '../components/ProfileCards';
import ProfileInfoSection from '../components/ProfileInfoSection';
import ProfileHeader from '../components/ProfileHeader';
import addIcon from '../../../../assets/add.png';
import readingIcon from '../../../../assets/reading.png';
import bookmarkIcon from '../../../../assets/bookmark.png';
import heartIcon from '../../../../assets/heart.png';
import rankIcon from '../../../../assets/rank.png';
import fireIcon from '../../../../assets/fire.png';

type ProfileScreenNavigationProp = StackNavigationProp<
  ProfileStackParamList,
  'ProfileMain'
>;

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { handleApiError, showClientError } = useErrorHandler();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute();
  const [bookCounts, setBookCounts] = useState({
    read: 0,
    currently_reading: 0,
    want_to_read: 0,
  });
  const [recentBooks, setRecentBooks] = useState<ActivityFeedItem[]>([]);
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
  const [incomingRequests, setIncomingRequests] = useState<Array<{
    id: string;
    requester: UserSummary;
    created_at: string;
  }>>([]);
  const [blockedUsers, setBlockedUsers] = useState<UserSummary[]>([]);
  const [mutedUsers, setMutedUsers] = useState<UserSummary[]>([]);
  const handleToggleWantToRead = useToggleWantToRead({
    currentUserId: user?.id,
    viewerShelfMap,
    setViewerShelfMap,
  });

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('username, first_name, last_name, books_read_count, weekly_streak, global_rank, member_since, profile_photo_url, bio')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.warn('Profile not found for user, showing placeholder');
        // Return placeholder profile if not found
        return {
          username: 'New User',
          first_name: 'New',
          last_name: 'User',
          books_read_count: 0,
          weekly_streak: 0,
          global_rank: null,
          member_since: user?.created_at || new Date().toISOString(),
          profile_photo_url: null,
          bio: null,
        };
      }
      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Return placeholder profile on error
      return {
        username: 'New User',
        first_name: 'New',
        last_name: 'User',
        books_read_count: 0,
        weekly_streak: 0,
        global_rank: null,
        member_since: user?.created_at || new Date().toISOString(),
        profile_photo_url: null,
        bio: null,
      };
    }
  };

  const hydrateRequesters = useCallback(async (
    requests: Array<{ id: string; requester_id: string; created_at: string }>
  ) => {
    if (requests.length === 0) return [] as Array<{
      id: string;
      requester: UserSummary;
      created_at: string;
    }>;

    const requesterIds = requests.map((req) => req.requester_id);
    const { data } = await supabase
      .from('user_profiles')
      .select('user_id, username, first_name, last_name, profile_photo_url')
      .in('user_id', requesterIds);

    const map = new Map((data || []).map((row: any) => [row.user_id, row]));
    return requests
      .map((req) => ({
        id: req.id,
        requester: map.get(req.requester_id) as UserSummary,
        created_at: req.created_at,
      }))
      .filter((item) => item.requester);
  }, []);

  const loadProfileData = useCallback(async (showLoading = true) => {
    if (!user) {
      if (showLoading) {
        setLoading(false);
      }
      return;
    }

    try {
      if (showLoading) {
        setLoading(true);
      }
      const [
        counts,
        recent,
        profile,
        followers,
        following,
        incomingRequestsResult,
        blockedUsersResult,
        mutedUsersResult,
      ] = await Promise.all([
        getUserBookCounts(user.id),
        fetchUserActivityCards(user.id, { limit: 20 }),
        fetchUserProfile(user.id),
        getFollowerCount(user.id),
        getFollowingCount(user.id),
        getIncomingFollowRequests(user.id),
        getBlockedUsers(user.id),
        getMutedUsers(user.id),
      ]);
      setBookCounts(counts);
      setRecentBooks(recent);
      const map: Record<string, { id: string; status: UserBook['status'] }> = {};
      recent.forEach((item) => {
        if (item.userBook.book_id) {
          map[item.userBook.book_id] = { id: item.userBook.id, status: item.userBook.status };
        }
      });
      setViewerShelfMap(map);
      setFollowerCount(followers.count);
      setFollowingCount(following.count);
      setBlockedUsers(blockedUsersResult.users);
      setMutedUsers(mutedUsersResult.users);
      const hydratedRequests = await hydrateRequesters(
        incomingRequestsResult.requests.map((req) => ({
          id: req.id,
          requester_id: req.requester_id,
          created_at: req.created_at,
        }))
      );
      setIncomingRequests(hydratedRequests);
      // Always set profile (even if placeholder) to prevent errors
      setUserProfile(profile || {
        username: 'New User',
        first_name: 'New User',
        last_name: '',
        books_read_count: 0,
        weekly_streak: 0,
        global_rank: null,
        member_since: user?.created_at || new Date().toISOString(),
        profile_photo_url: null,
        bio: null,
      });
    } catch (error) {
      handleApiError(error, 'load profile', () => loadProfileData(showLoading));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [hydrateRequesters, user, handleApiError]);

  useFocusEffect(
    React.useCallback(() => {
      loadProfileData();
    }, [loadProfileData])
  );

  // Listen for route params changes (triggered when ranking completes)
  React.useEffect(() => {
    const params = (route.params as any);
    if (params?.refresh) {
      loadProfileData();
      // Clear the param to avoid repeated refreshes
      (navigation as any).setParams({ refresh: undefined });
    }
  }, [loadProfileData, navigation, route.params]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadProfileData(false);
    } finally {
      setRefreshing(false);
    }
  };

  const getUsername = () => {
    if (!user?.email) return 'user';
    return user.email.split('@')[0];
  };

  const getJoinDate = () => {
    if (userProfile?.member_since) {
      const date = new Date(userProfile.member_since);
      const month = date.toLocaleString('default', { month: 'long' });
      const year = date.getFullYear();
      return `${month} ${year}`;
    }
    if (!user?.created_at) return 'Unknown';
    const date = new Date(user.created_at);
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return `${month} ${year}`;
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      const { error } = await acceptFollowRequest(requestId);
      if (error) throw error;
      setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));
      setFollowerCount((prev) => prev + 1);
    } catch (error) {
      handleApiError(error, 'accept follow request');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      const { error } = await rejectFollowRequest(requestId);
      if (error) throw error;
      setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));
    } catch (error) {
      handleApiError(error, 'reject follow request');
    }
  };

  const handleUnblock = async (userId: string) => {
    if (!user) return;
    try {
      const { error } = await unblockUser(user.id, userId);
      if (error) throw error;
      setBlockedUsers((prev) => prev.filter((item) => item.user_id !== userId));
    } catch (error) {
      handleApiError(error, 'unblock user');
    }
  };

  const handleUnmute = async (userId: string) => {
    if (!user) return;
    try {
      const { error } = await unmuteUser(user.id, userId);
      if (error) throw error;
      setMutedUsers((prev) => prev.filter((item) => item.user_id !== userId));
    } catch (error) {
      handleApiError(error, 'unmute user');
    }
  };

  // Get username from profile or fallback to email
  const getDisplayUsername = () => {
    if (userProfile?.username) {
      return userProfile.username;
    }
    return getUsername();
  };

  // Get user rank from profile
  const userRank = userProfile?.global_rank || null;

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error: any) {
              handleApiError(error, 'sign out');
            }
          },
        },
      ]
    );
  };

  const handleBookPress = async (userBook: UserBook) => {
    if (!user || !userBook.book) return;

    try {
      const { book, userBook: userBookData } = await fetchBookWithUserStatus(
        userBook.book_id,
        user.id
      );

      navigation.navigate('BookDetail', {
        book: {
          ...book,
          userBook: userBookData || null, // Include user's status, rating, etc.
        },
      });
    } catch (error) {
      handleApiError(error, 'load book');
    }
  };

  const handleOpenRecommendations = () => {
    const target = { screen: 'YourShelfMain', params: { initialTab: 'recommended' } };
    const parentNav = (navigation as any).getParent?.();
    if (parentNav?.navigate) {
      parentNav.navigate('Your Shelf', target);
      return;
    }
    (navigation as any).navigate('Your Shelf', target);
  };

  const renderRecentActivityItem = (item: ActivityFeedItem) => (
    <RecentActivityCard
      key={item.id}
      userBook={item.userBook}
      actionText={getActionText({
        status: item.userBook.status,
        activityContent: item.content,
        isSelf: true,
      })}
      avatarUrl={userProfile?.profile_photo_url}
      avatarFallback={getUsername()?.charAt(0)?.toUpperCase() || 'U'}
      onPressBook={handleBookPress}
      formatDateRange={formatDateRange}
      viewerStatus={viewerShelfMap[item.userBook.book_id]?.status || null}
      onToggleWantToRead={() => handleToggleWantToRead(item.userBook)}
    />
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ProfileHeader
        title={`@${getDisplayUsername()}`}
        styles={styles}
        rightSlot={(
          <TouchableOpacity style={styles.signoutButton} onPress={handleSignOut}>
            <Text style={styles.signoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        )}
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
          avatarFallback={getDisplayUsername()?.charAt(0)?.toUpperCase() || 'U'}
          displayName={`${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim()}
          memberSinceLabel={`Member since ${getJoinDate()}`}
          bio={userProfile?.bio}
          stats={{
            followers: followerCount,
            following: followingCount,
            rankLabel: userRank ? `#${userRank}` : '--',
            onPressFollowers: () =>
              user?.id &&
              navigation.navigate('FollowersFollowing', {
                userId: user.id,
                username: userProfile?.username,
                initialTab: 'followers',
              }),
            onPressFollowing: () =>
              user?.id &&
              navigation.navigate('FollowersFollowing', {
                userId: user.id,
                username: userProfile?.username,
                initialTab: 'following',
              }),
          }}
        >
          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <View style={styles.followGroup}>
              <TouchableOpacity
                style={[styles.followButton]}
                onPress={() => navigation.navigate('EditProfile')}
              >
                <Text style={styles.followButtonText}>Edit profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ProfileInfoSection>

        {/* Shelf Sections */}
        <View style={styles.shelfCardsContainer}>
          <ProfileShelfCard
            iconSource={addIcon}
            title="Read"
            count={bookCounts.read}
            onPress={() =>
              (navigation as any).navigate('Your Shelf', {
                screen: 'YourShelfMain',
                params: { initialTab: 'read' },
              })
            }
          />
          <ProfileShelfCard
            iconSource={readingIcon}
            title="Currently Reading"
            count={bookCounts.currently_reading}
            onPress={() =>
              (navigation as any).navigate('Your Shelf', {
                screen: 'YourShelfMain',
                params: { initialTab: 'currently_reading' },
              })
            }
          />
          <ProfileShelfCard
            iconSource={bookmarkIcon}
            title="Want to Read"
            count={bookCounts.want_to_read}
            onPress={() =>
              (navigation as any).navigate('Your Shelf', {
                screen: 'YourShelfMain',
                params: { initialTab: 'want_to_read' },
              })
            }
          />
          <ProfileShelfCard
            iconSource={heartIcon}
            title="Recommended for You"
            count={0}
            onPress={handleOpenRecommendations}
          />
        </View>

        {/* Stats Cards */}
        <View style={styles.statsCardsRow}>
          <ProfileStatCard
            iconSource={rankIcon}
            label="Rank on Inkli"
            value={userRank ? `#${userRank}` : '--'}
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
          {activeTab === 'profile' && (
            <View style={styles.profileContent}>
              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>
                  Follow Requests {incomingRequests.length > 0 ? `(${incomingRequests.length})` : ''}
                </Text>
                {incomingRequests.length === 0 ? (
                  <Text style={styles.sectionEmpty}>No pending requests.</Text>
                ) : (
                  incomingRequests.map((request) => (
                    <View key={request.id} style={styles.requestRow}>
                      <View style={styles.requestInfo}>
                        <Text style={styles.requestName}>
                          {request.requester.first_name} {request.requester.last_name}
                        </Text>
                        <Text style={styles.requestHandle}>@{request.requester.username}</Text>
                      </View>
                      <View style={styles.requestActions}>
                        <TouchableOpacity
                          style={[styles.actionPill, styles.acceptPill]}
                          onPress={() => handleAcceptRequest(request.id)}
                        >
                          <Text style={styles.actionPillText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionPill, styles.rejectPill]}
                          onPress={() => handleRejectRequest(request.id)}
                        >
                          <Text style={styles.actionPillText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>
                  Blocked Users {blockedUsers.length > 0 ? `(${blockedUsers.length})` : ''}
                </Text>
                {blockedUsers.length === 0 ? (
                  <Text style={styles.sectionEmpty}>You have not blocked anyone.</Text>
                ) : (
                  blockedUsers.map((blocked) => (
                    <View key={blocked.user_id} style={styles.requestRow}>
                      <View style={styles.requestInfo}>
                        <Text style={styles.requestName}>
                          {blocked.first_name} {blocked.last_name}
                        </Text>
                        <Text style={styles.requestHandle}>@{blocked.username}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.actionPill, styles.neutralPill]}
                        onPress={() => handleUnblock(blocked.user_id)}
                      >
                        <Text style={styles.actionPillText}>Unblock</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>
                  Muted Users {mutedUsers.length > 0 ? `(${mutedUsers.length})` : ''}
                </Text>
                {mutedUsers.length === 0 ? (
                  <Text style={styles.sectionEmpty}>You have not muted anyone.</Text>
                ) : (
                  mutedUsers.map((muted) => (
                    <View key={muted.user_id} style={styles.requestRow}>
                      <View style={styles.requestInfo}>
                        <Text style={styles.requestName}>
                          {muted.first_name} {muted.last_name}
                        </Text>
                        <Text style={styles.requestHandle}>@{muted.username}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.actionPill, styles.neutralPill]}
                        onPress={() => handleUnmute(muted.user_id)}
                      >
                        <Text style={styles.actionPillText}>Unmute</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  logoContainer: {
    flex: 1,
    flexShrink: 1,
    marginRight: 16,
  },
  logo: {
    fontSize: 32,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
    lineHeight: 40,
    includeFontPadding: false,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 16,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  headerLeftSpacer: {
    width: 0,
  },
  signoutButton: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signoutButtonText: {
    fontSize: 14,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  statItem: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  statDivider: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.3,
    marginHorizontal: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    paddingHorizontal: 16,
  },
  outlinedButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryBlue,
    alignItems: 'center',
  },
  outlinedButtonText: {
    fontSize: 14,
    fontFamily: typography.button,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  shelfCardsContainer: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`, // 1A = 10% opacity in hex
  },
  statsCardsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`, // 1A = 10% opacity in hex
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`, // 1A = 10% opacity in hex
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
  cardBookDetails: {
    marginBottom: 12,
  },
  cardAuthor: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 4,
  },
  cardMetadata: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
  },
  cardCoverImage: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: 8,
    marginBottom: 12,
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: `${colors.brownText}1A`, // 1A = 10% opacity in hex
    marginBottom: 8,
  },
  cardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardFooterIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFooterIconText: {
    fontSize: 18,
    color: colors.brownText,
  },
  cardFooterIconImage: {
    width: 18,
    height: 18,
    tintColor: colors.brownText,
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
  followButtonText: {
    fontSize: 14,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
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
  followMenu: {
    position: 'absolute',
    top: 44,
    right: 0,
    backgroundColor: colors.primaryBlue,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.brownText}1A`,
    paddingVertical: 6,
    minWidth: 160,
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
  settingsSection: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${colors.brownText}14`,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionHint: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginTop: 8,
  },
  sectionEmpty: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}10`,
  },
  requestInfo: {
    flex: 1,
    marginRight: 12,
  },
  requestName: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  requestHandle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  actionPillText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  acceptPill: {
    backgroundColor: colors.primaryBlue,
  },
  rejectPill: {
    backgroundColor: colors.brownText,
  },
  neutralPill: {
    backgroundColor: colors.primaryBlue,
  },
});
