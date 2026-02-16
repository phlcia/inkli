import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CompositeNavigationProp,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';
import { LeaderboardStackParamList } from '../../../navigation/LeaderboardStackNavigator';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import { FollowersFollowingParams } from '../../../navigation/types';
import {
  followUser,
  unfollowUser,
  getFollowingIds,
  getFollowerIds,
  getFollowersList,
  getFollowingList,
  getOutgoingFollowRequests,
  cancelFollowRequest,
  UserSummary,
} from '../../../services/userProfile';
import searchIcon from '../../../../assets/search.png';
type FollowersFollowingRoute = RouteProp<
  { FollowersFollowing: FollowersFollowingParams },
  'FollowersFollowing'
>;

type TabKey = 'followers' | 'following';

export default function FollowersFollowingScreen() {
  const { user: currentUser } = useAuth();
  type FollowersFollowingNavigation = CompositeNavigationProp<
    StackNavigationProp<ProfileStackParamList, 'FollowersFollowing'>,
    CompositeNavigationProp<
      StackNavigationProp<SearchStackParamList, 'FollowersFollowing'>,
      StackNavigationProp<LeaderboardStackParamList, 'FollowersFollowing'>
    >
  >;

  const navigation = useNavigation<FollowersFollowingNavigation>();
  const route = useRoute<FollowersFollowingRoute>();
  const { userId, username, initialTab } = route.params;

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followers, setFollowers] = useState<UserSummary[]>([]);
  const [following, setFollowing] = useState<UserSummary[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followerIds, setFollowerIds] = useState<Set<string>>(new Set());
  const [pendingRequestIds, setPendingRequestIds] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const [followersRes, followingRes] = await Promise.all([
        getFollowersList(userId),
        getFollowingList(userId),
      ]);

      setFollowers(followersRes.followers);
      setFollowing(followingRes.following);

      if (currentUser?.id) {
        const [followingIdsRes, followerIdsRes, outgoingRequestsRes] = await Promise.all([
          getFollowingIds(currentUser.id),
          getFollowerIds(currentUser.id),
          getOutgoingFollowRequests(currentUser.id),
        ]);
        setFollowingIds(new Set(followingIdsRes.followingIds));
        setFollowerIds(new Set(followerIdsRes.followerIds));
        setPendingRequestIds(new Set(outgoingRequestsRes.requests.map((req) => req.requested_id)));
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [currentUser?.id, userId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const data = activeTab === 'followers' ? followers : following;

  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) => {
      const fullName = (item.name || '').trim().toLowerCase();
      const handle = `@${item.username}`.toLowerCase();
      return fullName.includes(q) || handle.includes(q) || item.username.toLowerCase().includes(q);
    });
  }, [data, searchQuery]);

  const handleToggleFollow = async (targetId: string) => {
    if (!currentUser?.id || targetId === currentUser.id) return;

    setFollowLoading((prev) => new Set(prev).add(targetId));
    try {
      const isFollowing = followingIds.has(targetId);
      const isPending = pendingRequestIds.has(targetId);
      if (isFollowing) {
        const { error } = await unfollowUser(currentUser.id, targetId);
        if (!error) {
          setFollowingIds((prev) => {
            const next = new Set(prev);
            next.delete(targetId);
            return next;
          });
          if (currentUser.id === userId && activeTab === 'following') {
            setFollowing((prev) => prev.filter((u) => u.user_id !== targetId));
          }
        }
      } else if (isPending) {
        const { error } = await cancelFollowRequest(currentUser.id, targetId);
        if (!error) {
          setPendingRequestIds((prev) => {
            const next = new Set(prev);
            next.delete(targetId);
            return next;
          });
        }
      } else {
        const { action, error } = await followUser(currentUser.id, targetId);
        if (!error) {
          if (action === 'following') {
            setFollowingIds((prev) => new Set(prev).add(targetId));
          } else {
            setPendingRequestIds((prev) => new Set(prev).add(targetId));
          }
        }
      }
    } finally {
      setFollowLoading((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  const renderItem = ({ item }: { item: UserSummary }) => {
    const isFollowing = followingIds.has(item.user_id);
    const isPending = pendingRequestIds.has(item.user_id);
    const isLoading = followLoading.has(item.user_id);
    const fullName = (item.name || '').trim();
    const followsYou = followerIds.has(item.user_id);
    const followLabel = isFollowing ? 'Following' : isPending ? 'Requested' : 'Follow';

    return (
      <TouchableOpacity
        style={styles.rowCard}
        activeOpacity={0.7}
        onPress={() => {
          if (currentUser?.id === item.user_id) return;
          navigation.navigate('UserProfile', {
            userId: item.user_id,
            username: item.username,
          });
        }}
      >
        {item.profile_photo_url ? (
          <Image source={{ uri: item.profile_photo_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {(item.name?.charAt(0) || item.username?.charAt(0) || 'U').toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowName}>{fullName || item.username}</Text>
          {followsYou && item.user_id !== currentUser?.id && (
            <Text style={styles.rowSubtext}>Follows you</Text>
          )}
        </View>
        {item.user_id !== currentUser?.id && (
          <TouchableOpacity
            style={[styles.followButton, (isFollowing || isPending) && styles.followingButton]}
            onPress={(e) => {
              e.stopPropagation();
              handleToggleFollow(item.user_id);
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={(isFollowing || isPending) ? colors.brownText : colors.white} />
            ) : (
              <Text style={[styles.followButtonText, (isFollowing || isPending) && styles.followingButtonText]}>
                {followLabel}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>@{username || 'Profile'}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'followers' && styles.tabActive]}
            onPress={() => setActiveTab('followers')}
          >
            <Text style={styles.tabLabel}>{followers.length} Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'following' && styles.tabActive]}
            onPress={() => setActiveTab('following')}
          >
            <Text style={styles.tabLabel}>{following.length} Following</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Image source={searchIcon} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab}`}
            placeholderTextColor={colors.brownText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primaryBlue} />
          </View>
        ) : (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.user_id}
            renderItem={renderItem}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerSpacer: {
    width: 40,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.brownText,
  },
  tabLabel: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: {
    width: 18,
    height: 18,
    tintColor: colors.brownText,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  rowSubtext: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    marginTop: 2,
  },
  followButton: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '500',
  },
  followingButtonText: {
    color: colors.primaryBlue,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
