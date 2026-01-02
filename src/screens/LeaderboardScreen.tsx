import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../config/theme';
import { supabase } from '../config/supabase';
import { useAuth } from '../contexts/AuthContext';

interface LeaderboardUser {
  user_id: string;
  username: string;
  books_read_count: number;
  global_rank: number;
  profile_photo_url: string | null;
}

export default function LeaderboardScreen() {
  const { user: currentUser } = useAuth();
  const [topUsers, setTopUsers] = useState<LeaderboardUser[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<LeaderboardUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, [currentUser]);

  async function fetchLeaderboard() {
    try {
      setLoading(true);
      
      // Get top 100 users
      const { data: leaders, error: leadersError } = await supabase
        .from('user_profiles')
        .select('user_id, username, books_read_count, global_rank, profile_photo_url')
        .not('global_rank', 'is', null)
        .order('global_rank', { ascending: true })
        .limit(100);
      
      if (leadersError) {
        console.error('Error fetching leaders:', leadersError);
        return;
      }
      
      setTopUsers(leaders || []);
      
      // Get current user's rank if not in top 100
      if (currentUser) {
        const { data: currentUserData, error: currentUserError } = await supabase
          .from('user_profiles')
          .select('user_id, username, books_read_count, global_rank, profile_photo_url')
          .eq('user_id', currentUser.id)
          .single();
        
        if (!currentUserError && currentUserData) {
          // Diagnostic: Check if user has books but no rank
          if (currentUserData.books_read_count > 0 && !currentUserData.global_rank) {
            console.warn('⚠️ User has books but no rank. Ranking system may need recalculation.');
            console.log(`User has ${currentUserData.books_read_count} books but global_rank is null`);
          }
          
          const isInTop100 = leaders?.some(u => u.user_id === currentUser.id);
          if (!isInTop100 && currentUserData.global_rank) {
            setCurrentUserRank(currentUserData);
          }
        }
      }
      
      // Diagnostic: Log if no leaders found but users exist with books
      if ((!leaders || leaders.length === 0) && currentUser) {
        const { data: usersWithBooks } = await supabase
          .from('user_profiles')
          .select('user_id, books_read_count, global_rank')
          .gt('books_read_count', 0)
          .limit(5);
        
        if (usersWithBooks && usersWithBooks.length > 0) {
          const usersWithoutRank = usersWithBooks.filter(u => !u.global_rank);
          if (usersWithoutRank.length > 0) {
            console.warn('⚠️ Found users with books but no ranks. Ranking system needs recalculation.');
            console.log('Users with books but no rank:', usersWithoutRank.length);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>Leaderboard</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>Leaderboard</Text>
        </View>
        <View style={styles.headerRight}>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerText}>Top Readers</Text>
        
        {topUsers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No rankings yet</Text>
            <Text style={styles.emptySubtext}>Start reading books to see your rank!</Text>
          </View>
        ) : (
          <>
            {topUsers.map((user, index) => (
              <View 
                key={user.user_id} 
                style={[
                  styles.leaderboardRow,
                  user.user_id === currentUser?.id && styles.currentUserRow
                ]}
              >
                <Text style={styles.rank}>#{user.global_rank}</Text>
                {user.profile_photo_url ? (
                  <Image 
                    source={{ uri: user.profile_photo_url }} 
                    style={styles.avatar} 
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {user.username.substring(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.username} numberOfLines={1}>{user.username}</Text>
                <Text style={styles.count}>{user.books_read_count}</Text>
              </View>
            ))}
            
            {/* Show current user's position if not in top 100 */}
            {currentUserRank && currentUserRank.global_rank > 100 && (
              <View style={styles.currentUserSection}>
                <Text style={styles.yourRankLabel}>Your Rank</Text>
                <View style={[styles.leaderboardRow, styles.currentUserRow]}>
                  <Text style={styles.rank}>#{currentUserRank.global_rank}</Text>
                  {currentUserRank.profile_photo_url ? (
                    <Image 
                      source={{ uri: currentUserRank.profile_photo_url }} 
                      style={styles.avatar} 
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {currentUserRank.username.substring(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.username} numberOfLines={1}>{currentUserRank.username}</Text>
                  <Text style={styles.count}>{currentUserRank.books_read_count}</Text>
                </View>
              </View>
            )}
          </>
        )}
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
  },
  headerRight: {
    flexDirection: 'row',
    gap: 16,
    flexShrink: 0,
  },
  headerIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
    color: colors.brownText,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  headerText: {
    fontSize: 24,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  currentUserRow: {
    backgroundColor: colors.primaryBlue + '15', // 15 = ~8% opacity
    borderWidth: 2,
    borderColor: colors.primaryBlue,
  },
  rank: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    width: 50,
    textAlign: 'left',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  username: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '500',
    marginRight: 12,
  },
  count: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  currentUserSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: `${colors.brownText}1A`,
  },
  yourRankLabel: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    textAlign: 'center',
  },
});

