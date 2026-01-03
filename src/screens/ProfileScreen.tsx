import React, { useState } from 'react';
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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ProfileStackParamList } from '../navigation/ProfileStackNavigator';
import { colors, typography } from '../config/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserBookCounts,
  getRecentUserBooks,
  UserBook,
} from '../services/books';
import { getFollowerCount, getFollowingCount } from '../services/userProfile';
import { getScoreColor, formatScore } from '../utils/rankScoreColors';
import { supabase } from '../config/supabase';

type ProfileScreenNavigationProp = StackNavigationProp<
  ProfileStackParamList,
  'ProfileMain'
>;

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute();
  const [bookCounts, setBookCounts] = useState({
    read: 0,
    currently_reading: 0,
    want_to_read: 0,
  });
  const [recentBooks, setRecentBooks] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'activity' | 'profile'>('activity');
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
      
      console.log('Profile fetched:', {
        username: data?.username,
        profile_photo_url: data?.profile_photo_url,
        hasPhoto: !!data?.profile_photo_url,
      });
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

  const loadProfileData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('=== ProfileScreen: Loading profile data ===');
      const [counts, recent, profile, followers, following] = await Promise.all([
        getUserBookCounts(user.id),
        getRecentUserBooks(user.id, 20),
        fetchUserProfile(user.id),
        getFollowerCount(user.id),
        getFollowingCount(user.id),
      ]);
      console.log('=== ProfileScreen: Data loaded ===');
      console.log('Recent books count:', recent.length);
      recent.forEach((book, idx) => {
        console.log(`  ${idx}: ${book.book?.title} - rank_score: ${book.rank_score}, rating: ${book.rating}`);
      });
      setBookCounts(counts);
      setRecentBooks(recent);
      setFollowerCount(followers.count);
      setFollowingCount(following.count);
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
      console.error('Error loading profile data:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      console.log('=== ProfileScreen: useFocusEffect - loading data ===');
      loadProfileData();
    }, [user])
  );

  // Listen for route params changes (triggered when ranking completes)
  React.useEffect(() => {
    const params = (route.params as any);
    if (params?.refresh) {
      console.log('=== ProfileScreen: Refresh triggered by route param ===');
      loadProfileData();
      // Clear the param to avoid repeated refreshes
      (navigation as any).setParams({ refresh: undefined });
    }
  }, [route.params, navigation, user]);

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
              Alert.alert('Error', error.message || 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const renderShelfSection = (
    iconSource: any,
    title: string,
    count: number,
    onPress?: () => void
  ) => (
    <TouchableOpacity
      style={styles.shelfCard}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
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
    switch (status) {
      case 'read':
        return 'You finished';
      case 'currently_reading':
        return 'You started reading';
      case 'want_to_read':
        return 'You bookmarked';
      default:
        return 'You added';
    }
  };

  const formatDayOfWeek = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  };

  const formatDateForDisplay = (dateString: string): string => {
    // dateString is in YYYY-MM-DD format, parse it as local date to avoid timezone issues
    const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone shift
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
    if (!user || !userBook.book) return;

    try {
      // Fetch full book details from database
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', userBook.book_id)
        .single();

      if (error) throw error;

      // Check if user already has this book
      const { data: userBookData } = await supabase
        .from('user_books')
        .select('*')
        .eq('user_id', user.id)
        .eq('book_id', fullBook.id)
        .single();

      // Navigate to BookDetailScreen with book data
      navigation.navigate('BookDetail', {
        book: {
          ...fullBook,
          userBook: userBookData || null, // Include user's status, rating, etc.
        },
      });
    } catch (error) {
      console.error('Error loading book details:', error);
      Alert.alert('Error', 'Could not load book details');
    }
  };

  const renderRecentActivityItem = (userBook: UserBook) => {
    const book = userBook.book;
    if (!book) return null;

    const actionText = getActionText(userBook.status);

    return (
      <View
        key={userBook.id}
        style={styles.activityCard}
      >
        {/* Header Section */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            {userProfile?.profile_photo_url ? (
              <Image
                source={{ uri: userProfile.profile_photo_url }}
                style={styles.cardAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.cardAvatar}>
                <Text style={styles.cardAvatarText}>
                  {getUsername().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardActionText}>
                {actionText} <Text style={styles.cardBookTitle}>{book.title}</Text>
              </Text>
            </View>
          </View>
          {userBook.rank_score !== null && (
            <View
              style={[
                styles.scoreCircle,
                { backgroundColor: getScoreColor(userBook.rank_score) },
              ]}
            >
              <Text style={styles.scoreText}>{formatScore(userBook.rank_score)}</Text>
            </View>
          )}
        </View>

        {/* Make book info section tappable */}
        <TouchableOpacity
          style={styles.bookInfoSection}
          onPress={() => handleBookPress(userBook)}
          activeOpacity={0.7}
        >
          {book.cover_url && (
            <Image
              source={{ uri: book.cover_url }}
              style={styles.bookCover}
              resizeMode="contain"
            />
          )}
          <View style={styles.bookInfo}>
            <View style={styles.bookTextInfo}>
              <Text style={styles.bookTitle} numberOfLines={2}>
                {book.title}
              </Text>
              <Text style={styles.bookAuthor} numberOfLines={1}>
                {book.authors?.join(', ') || 'Unknown Author'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Dates Read Section */}
        {(userBook.started_date || userBook.finished_date) && (
          <View style={[
            styles.cardDetailsSection,
            userBook.notes && styles.cardDetailsSectionWithNotes
          ]}>
            <Text style={styles.cardDetailsText}>
              <Text style={styles.cardDetailsLabel}>Dates read: </Text>
              <Text style={styles.cardDetailsValue}>
                {formatDateRange(userBook.started_date || null, userBook.finished_date || null) || 'Not set'}
              </Text>
            </Text>
          </View>
        )}

        {/* Notes Section */}
        {userBook.notes && (
          <View style={[
            styles.cardDetailsSection,
            (userBook.started_date || userBook.finished_date) && styles.cardDetailsSectionFollowing
          ]}>
            <Text style={styles.cardDetailsText}>
              <Text style={styles.cardDetailsLabel}>Notes: </Text>
              <Text style={styles.cardDetailsValue}>{userBook.notes}</Text>
            </Text>
          </View>
        )}

        {/* Interaction Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.cardFooterLeft}>
            <TouchableOpacity style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/heart.png')}
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/comment.png')}
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/share.png')}
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.cardFooterRight}>
            <TouchableOpacity style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/add.png')}
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/reading.png')}
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/bookmark.png')}
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Timestamp */}
        <Text style={styles.cardTimestamp}>
          {formatDayOfWeek(userBook.updated_at)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>@{getDisplayUsername()}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.signoutButton} onPress={handleSignOut}>
            <Text style={styles.signoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
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
                onError={(e) => {
                  console.error('Error loading profile photo:', e.nativeEvent.error);
                  console.log('Photo URL:', userProfile.profile_photo_url);
                }}
                onLoad={() => {
                  console.log('Profile photo loaded successfully:', userProfile.profile_photo_url);
                }}
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getDisplayUsername().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.username}>{userProfile?.first_name} {userProfile?.last_name}</Text>
          <Text style={styles.memberSince}>Member since {getJoinDate()}</Text>
          {userProfile?.bio && (
            <Text style={styles.bio}>{userProfile.bio}</Text>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statBoxValue}>{followerCount}</Text>
              <Text style={styles.statBoxLabel}>Followers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxValue}>{followingCount}</Text>
              <Text style={styles.statBoxLabel}>Following</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxValue}>
                {userRank ? `#${userRank}` : '--'}
              </Text>
              <Text style={styles.statBoxLabel}>Rank</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.outlinedButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Text style={styles.outlinedButtonText}>Edit profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlinedButton}>
              <Text style={styles.outlinedButtonText}>Share profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Shelf Sections */}
        <View style={styles.shelfCardsContainer}>
          {renderShelfSection(
            require('../../assets/add.png'), 
            'Read', 
            bookCounts.read,
            () => (navigation as any).navigate('Your Shelf', { screen: 'YourShelfMain', params: { initialTab: 'read' } })
          )}
          {renderShelfSection(
            require('../../assets/reading.png'), 
            'Currently Reading', 
            bookCounts.currently_reading,
            () => (navigation as any).navigate('Your Shelf', { screen: 'YourShelfMain', params: { initialTab: 'currently_reading' } })
          )}
          {renderShelfSection(
            require('../../assets/bookmark.png'), 
            'Want to Read', 
            bookCounts.want_to_read,
            () => (navigation as any).navigate('Your Shelf', { screen: 'YourShelfMain', params: { initialTab: 'want_to_read' } })
          )}
          {renderShelfSection(
            require('../../assets/heart.png'), 
            'Recommended for You', 
            0
          )}
        </View>

        {/* Stats Cards */}
        <View style={styles.statsCardsRow}>
          {renderStatCard(require('../../assets/rank.png'), 'Rank on Inkli', userRank ? `#${userRank}` : '--')}
          {renderStatCard(require('../../assets/fire.png'), 'Weekly Streak', `${userProfile?.weekly_streak ?? 0} weeks`)}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`, // 1A = 10% opacity in hex
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
    borderBottomColor: `${colors.brownText}1A`, // 1A = 10% opacity in hex
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
