import React, { RefObject } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import RecentActivityCard from '../../social/components/RecentActivityCard';
import { getActionText } from '../../../utils/activityText';
import { formatDateRange } from '../../../utils/dateRanges';
import type { UserBook } from '../../../services/books';

export type FriendsRankingsSectionProps = {
  friendsRankings: Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>;
  friendsRankingsLoading: boolean;
  friendsRankingsError: string | null;
  friendsRankingsTotalCount: number;
  onRetry: () => void;
  onShowMore: () => void;
  onPressUser: (userId: string, username: string) => void;
  onPressBook: (userBook: UserBook) => void;
  sectionRef?: RefObject<View>;
  styles: Record<string, object>;
  FriendsRankingSkeletonCard: React.ComponentType;
  loadingIndicatorColor: string;
};

export default function FriendsRankingsSection({
  friendsRankings,
  friendsRankingsLoading,
  friendsRankingsError,
  friendsRankingsTotalCount,
  onRetry,
  onShowMore,
  onPressUser,
  onPressBook,
  sectionRef,
  styles,
  FriendsRankingSkeletonCard,
  loadingIndicatorColor,
}: FriendsRankingsSectionProps) {
  if (!(friendsRankings.length > 0 || friendsRankingsLoading || friendsRankingsError)) {
    return null;
  }

  return (
    <View style={styles.descriptionSection} ref={sectionRef}>
      <Text style={styles.descriptionLabel}>What your friends think</Text>

      {friendsRankingsError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{friendsRankingsError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
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
            actionText={getActionText({
              status: friendRanking.status,
              displayName: userProfile.username,
            })}
            userDisplayName={userProfile.username}
            avatarUrl={userProfile.profile_photo_url}
            avatarFallback={userProfile.username?.charAt(0).toUpperCase() || 'U'}
            onPressBook={onPressBook}
            onPressUser={() => onPressUser(userProfile.user_id, userProfile.username)}
            formatDateRange={formatDateRange}
            viewerStatus={null}
            showCommentsLink={true}
            showCommentIcon={true}
            hideActionText={true}
            hideBookInfo={true}
          />
        );
      })}

      {friendsRankingsLoading && friendsRankings.length > 0 && <FriendsRankingSkeletonCard />}

      {!friendsRankingsError &&
        friendsRankings.length > 0 &&
        friendsRankings.length < friendsRankingsTotalCount && (
          <TouchableOpacity
            style={styles.showMoreButton}
            onPress={onShowMore}
            disabled={friendsRankingsLoading}
          >
            {friendsRankingsLoading ? (
              <ActivityIndicator size="small" color={loadingIndicatorColor} />
            ) : (
              <Text style={styles.showMoreButtonText}>
                Show More ({friendsRankingsTotalCount - friendsRankings.length} remaining)
              </Text>
            )}
          </TouchableOpacity>
        )}
    </View>
  );
}
