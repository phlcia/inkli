import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../../config/theme';
import RecentActivityCard from './RecentActivityCard';
import type { UserBook } from '../../../services/books';
import type { CommentRow } from '../hooks/useActivityComments';
import heartShadedIcon from '../../../../assets/heartshaded.png';
import heartIcon from '../../../../assets/heart.png';

type ActivityCommentsListProps = {
  loading: boolean;
  rows: CommentRow[];
  refreshing: boolean;
  onRefresh: () => void;
  headerUserBook: UserBook | null;
  headerActionText: string;
  headerAvatarUrl: string | null;
  headerAvatarFallback: string;
  headerViewerStatus: 'read' | 'currently_reading' | 'want_to_read' | null;
  onPressBook: (userBook: UserBook) => void;
  formatDateRange: (startDate: string | null, endDate?: string | null) => string | null;
  onReply: (comment: CommentRow['item']) => void;
  likeCounts: Map<string, number>;
  likedKeys: Set<string>;
  currentUserId?: string;
  onToggleLike: (commentId: string) => void;
  onPressLikes: (commentId: string) => void;
  onNavigateProfile: (userId: string, username: string) => void;
  renderMentionText: (text: string) => React.ReactNode;
  styles: {
    loadingContainer: any;
    listContent: any;
    activityHeader: any;
    commentRow: any;
    replyRow: any;
    avatar: any;
    avatarPlaceholder: any;
    avatarText: any;
    commentContent: any;
    inlineCommentText: any;
    usernameText: any;
    commentActions: any;
    replyText: any;
    likeCountText: any;
    likeButton: any;
    likeIcon: any;
  };
};

export default function ActivityCommentsList({
  loading,
  rows,
  refreshing,
  onRefresh,
  headerUserBook,
  headerActionText,
  headerAvatarUrl,
  headerAvatarFallback,
  headerViewerStatus,
  onPressBook,
  formatDateRange,
  onReply,
  likeCounts,
  likedKeys,
  currentUserId,
  onToggleLike,
  onPressLikes,
  onNavigateProfile,
  renderMentionText,
  styles,
}: ActivityCommentsListProps) {
  const renderItem = ({ item }: { item: CommentRow }) => {
    const comment = item.item;
    const username = comment.user?.username || 'user';
    const avatarUrl = comment.user?.avatar_url || null;
    const isReply = item.isReply;
    const likeCount = likeCounts.get(comment.id) || 0;
    const likedKey = currentUserId ? `${comment.id}:${currentUserId}` : '';
    const isLiked = likedKey ? likedKeys.has(likedKey) : false;

    return (
      <View style={[styles.commentRow, isReply && styles.replyRow]}>
        <TouchableOpacity
          onPress={() => onNavigateProfile(comment.user_id, username)}
          activeOpacity={0.7}
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
        </TouchableOpacity>
        <View style={styles.commentContent}>
          <Text style={styles.inlineCommentText}>
            <Text
              style={styles.usernameText}
              onPress={() => onNavigateProfile(comment.user_id, username)}
            >
              @{username}{' '}
            </Text>
            {renderMentionText(comment.comment_text)}
          </Text>
          <View style={styles.commentActions}>
            <TouchableOpacity onPress={() => onReply(comment)} activeOpacity={0.7}>
              <Text style={styles.replyText}>Reply</Text>
            </TouchableOpacity>
            {likeCount > 0 && (
              <TouchableOpacity
                onPress={() => onPressLikes(comment.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.likeCountText}>
                  {likeCount} like{likeCount === 1 ? '' : 's'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.likeButton}
          onPress={() => onToggleLike(comment.id)}
          activeOpacity={0.7}
        >
          <Image
            source={isLiked ? heartShadedIcon : heartIcon}
            style={styles.likeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.item.id}
      renderItem={renderItem}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primaryBlue}
        />
      }
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        headerUserBook ? (
          <View style={styles.activityHeader}>
            <RecentActivityCard
              userBook={headerUserBook}
              actionText={headerActionText}
              avatarUrl={headerAvatarUrl}
              avatarFallback={headerAvatarFallback}
              onPressBook={onPressBook}
              formatDateRange={formatDateRange}
              viewerStatus={headerViewerStatus}
              showCommentIcon={false}
              showCommentsLink={false}
            />
          </View>
        ) : null
      }
    />
  );
}
