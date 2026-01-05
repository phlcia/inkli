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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CompositeNavigationProp,
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../config/theme';
import { useAuth } from '../contexts/AuthContext';
import { ProfileStackParamList } from '../navigation/ProfileStackNavigator';
import { SearchStackParamList } from '../navigation/SearchStackNavigator';
import { ActivityLikesParams } from '../navigation/types';
import { getActivityLikes } from '../services/activityLikes';
import { ActivityLike } from '../types/activityLikes';
import {
  followUser,
  unfollowUser,
  getFollowingIds,
  getFollowerIds,
} from '../services/userProfile';

type ActivityLikesRoute = RouteProp<
  { ActivityLikes: ActivityLikesParams },
  'ActivityLikes'
>;

export default function ActivityLikesScreen() {
  const { user: currentUser } = useAuth();
  type ActivityLikesNavigation = CompositeNavigationProp<
    StackNavigationProp<ProfileStackParamList, 'ActivityLikes'>,
    StackNavigationProp<SearchStackParamList, 'ActivityLikes'>
  >;

  const navigation = useNavigation<ActivityLikesNavigation>();
  const route = useRoute<ActivityLikesRoute>();
  const { userBookId } = route.params;

  const [likes, setLikes] = useState<ActivityLike[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followerIds, setFollowerIds] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());

  const loadLikes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getActivityLikes(userBookId);
      setLikes(data);

      if (currentUser?.id) {
        const [followingIdsRes, followerIdsRes] = await Promise.all([
          getFollowingIds(currentUser.id),
          getFollowerIds(currentUser.id),
        ]);
        setFollowingIds(new Set(followingIdsRes.followingIds));
        setFollowerIds(new Set(followerIdsRes.followerIds));
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, userBookId]);

  React.useEffect(() => {
    loadLikes();
  }, [loadLikes]);

  const filteredLikes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return likes;
    return likes.filter((item) => {
      const username = item.user?.username?.toLowerCase() || '';
      return username.includes(q) || `@${username}`.includes(q);
    });
  }, [likes, searchQuery]);

  const handleToggleFollow = async (targetId: string) => {
    if (!currentUser?.id || targetId === currentUser.id) return;

    setFollowLoading((prev) => new Set(prev).add(targetId));
    try {
      const isFollowing = followingIds.has(targetId);
      if (isFollowing) {
        const { error } = await unfollowUser(currentUser.id, targetId);
        if (!error) {
          setFollowingIds((prev) => {
            const next = new Set(prev);
            next.delete(targetId);
            return next;
          });
        }
      } else {
        const { error } = await followUser(currentUser.id, targetId);
        if (!error) {
          setFollowingIds((prev) => new Set(prev).add(targetId));
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

  const renderItem = ({ item }: { item: ActivityLike }) => {
    const username = item.user?.username || 'user';
    const avatarUrl = item.user?.avatar_url || null;
    const isFollowing = followingIds.has(item.user_id);
    const isLoading = followLoading.has(item.user_id);
    const followsYou = followerIds.has(item.user_id);

    return (
      <TouchableOpacity
        style={styles.rowCard}
        activeOpacity={0.7}
        onPress={() => {
          if (currentUser?.id === item.user_id) return;
          navigation.navigate('UserProfile', {
            userId: item.user_id,
            username,
          });
        }}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowName}>@{username}</Text>
          {followsYou && item.user_id !== currentUser?.id && (
            <Text style={styles.rowSubtext}>Follows you</Text>
          )}
        </View>
        {item.user_id !== currentUser?.id && (
          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followingButton]}
            onPress={(e) => {
              e.stopPropagation();
              handleToggleFollow(item.user_id);
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={isFollowing ? colors.brownText : colors.white}
              />
            ) : (
              <Text
                style={[styles.followButtonText, isFollowing && styles.followingButtonText]}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Likes</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchContainer}>
        <Image source={require('../../assets/search.png')} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search likes"
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
          data={filteredLikes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No likes yet</Text>
          }
        />
      )}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    fontSize: 28,
    color: colors.primaryBlue,
    width: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerSpacer: {
    width: 32,
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
  emptyText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 24,
  },
});
