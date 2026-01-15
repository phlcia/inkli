import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../../../config/theme';
import { UserBook } from '../../../services/books';
import { getScoreColor, formatScore } from '../../../utils/rankScoreColors';
import { useAuth } from '../../../contexts/AuthContext';
import { checkUserLiked, getLikesCount, toggleLike } from '../../../services/activityLikes';
import { getCommentsCount } from '../../../services/activityComments';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import { formatActivityTimestamp } from '../../../utils/dateUtils';

type RecentActivityCardProps = {
  userBook: UserBook;
  actionText: string;
  userDisplayName?: string;
  avatarUrl?: string | null;
  avatarFallback: string;
  onPressBook: (userBook: UserBook) => void;
  onPressUser?: () => void;
  onPressBookTitle?: () => void;
  formatDateRange: (startDate: string | null, endDate: string | null) => string | null;
  viewerStatus?: 'read' | 'currently_reading' | 'want_to_read' | null;
  onToggleWantToRead?: () => void;
  showCommentsLink?: boolean;
  showCommentIcon?: boolean;
  hideActionText?: boolean;
  hideBookInfo?: boolean;
};


export default function RecentActivityCard({
  userBook,
  actionText,
  userDisplayName,
  avatarUrl,
  avatarFallback,
  onPressBook,
  onPressUser,
  onPressBookTitle,
  formatDateRange,
  viewerStatus = null,
  onToggleWantToRead,
  showCommentsLink = true,
  showCommentIcon = true,
  hideActionText = false,
  hideBookInfo = false,
}: RecentActivityCardProps) {
  const book = userBook.book;
  if (!book) return null;
  const isRead = viewerStatus === 'read';
  const isCurrentlyReading = viewerStatus === 'currently_reading';
  const isWantToRead = viewerStatus === 'want_to_read';
  const actionTint = getScoreColor(10);
  const { user } = useAuth();
  type ActivityNavigation = CompositeNavigationProp<
    StackNavigationProp<ProfileStackParamList>,
    StackNavigationProp<SearchStackParamList>
  >;
  const navigation = useNavigation<ActivityNavigation>();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(userBook.likes_count ?? 0);
  const [commentsCount, setCommentsCount] = useState(userBook.comments_count ?? 0);
  const [likeLoading, setLikeLoading] = useState(false);
  const shouldShowCommentsLink = showCommentsLink && commentsCount > 0;
  const shouldShowLikesRow = likesCount > 0 || shouldShowCommentsLink;
  const actionSuffix = userDisplayName && actionText.startsWith(`${userDisplayName} `)
    ? actionText.slice(userDisplayName.length + 1)
    : actionText;

  useEffect(() => {
    setLikesCount(userBook.likes_count ?? 0);
  }, [userBook.likes_count]);

  useEffect(() => {
    setCommentsCount(userBook.comments_count ?? 0);
  }, [userBook.comments_count]);

  useEffect(() => {
    let isActive = true;

    const loadLikeState = async () => {
      if (!user?.id) return;
      try {
        const hasLiked = await checkUserLiked(userBook.id, user.id);
        if (isActive) setLiked(hasLiked);
      } catch (error) {
        console.error('Error loading activity like state:', error);
      }
    };

    loadLikeState();

    return () => {
      isActive = false;
    };
  }, [user?.id, userBook.id]);

  useEffect(() => {
    let isActive = true;

    const loadLikesCount = async () => {
      try {
        const count = await getLikesCount(userBook.id);
        if (isActive) setLikesCount(count);
      } catch (error) {
        console.error('Error loading likes count:', error);
      }
    };

    loadLikesCount();

    return () => {
      isActive = false;
    };
  }, [userBook.id]);

  useEffect(() => {
    let isActive = true;

    const loadCommentsCount = async () => {
      try {
        const count = await getCommentsCount(userBook.id);
        if (isActive) setCommentsCount(count);
      } catch (error) {
        console.error('Error loading comments count:', error);
      }
    };

    loadCommentsCount();

    return () => {
      isActive = false;
    };
  }, [userBook.id]);

  const handleToggleLike = async () => {
    if (!user?.id || likeLoading) return;
    setLikeLoading(true);
    try {
      const result = await toggleLike(userBook.id, user.id);
      setLiked(result.liked);
      setLikesCount((prev) =>
        Math.max(0, prev + (result.liked ? 1 : -1))
      );
    } catch (error) {
      console.error('Error toggling activity like:', error);
    } finally {
      setLikeLoading(false);
    }
  };

  const handlePressLikes = () => {
    navigation.navigate('ActivityLikes', { userBookId: userBook.id });
  };

  const handlePressComments = () => {
    navigation.navigate('ActivityComments', {
      userBookId: userBook.id,
      userBook,
      actionText,
      avatarUrl,
      avatarFallback,
      viewerStatus,
    });
  };

  return (
    <View style={styles.activityCard}>
      {/* Header Section */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.cardAvatar}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardAvatar}>
              <Text style={styles.cardAvatarText}>
                {avatarFallback || 'U'}
              </Text>
            </View>
          )}
          <View style={styles.cardHeaderText}>
            {hideActionText ? (
              // Show just username when action text is hidden
              userDisplayName ? (
                <Text style={styles.cardActionText}>
                  <Text style={styles.cardUserText} onPress={onPressUser}>
                    {userDisplayName}
                  </Text>
                </Text>
              ) : null
            ) : (
              // Show full action text when not hidden
              <Text style={styles.cardActionText}>
                {userDisplayName ? (
                  <Text style={styles.cardUserText} onPress={onPressUser}>
                    {userDisplayName}
                  </Text>
                ) : null}
                {userDisplayName ? ' ' : ''}
                {actionSuffix}{' '}
                <Text style={styles.cardBookTitle} onPress={onPressBookTitle || (() => onPressBook(userBook))}>
                  {book.title}
                </Text>
                {(userBook as any).read_count && (userBook as any).read_count > 1 && (
                  <Text style={styles.readCountBadge}>
                    {' '}({(userBook as any).read_count}x)
                  </Text>
                )}
              </Text>
            )}
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

      {/* Book info section */}
      {!hideBookInfo && (
        <TouchableOpacity
          style={styles.bookInfoSection}
          onPress={() => onPressBook(userBook)}
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
      )}

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

      {shouldShowLikesRow && (
        <>
          <View style={styles.likesDivider} />
          <View style={styles.likesRow}>
            {likesCount > 0 ? (
              <TouchableOpacity onPress={handlePressLikes} activeOpacity={0.7}>
                <Text style={styles.likesText}>
                  {likesCount} {likesCount === 1 ? 'like' : 'likes'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {shouldShowCommentsLink && (
              <TouchableOpacity onPress={handlePressComments} activeOpacity={0.7}>
                <Text style={styles.commentsLinkText}>
                  View {commentsCount} {commentsCount === 1 ? 'comment' : 'comments'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* Interaction Footer */}
      <View style={styles.cardFooter}>
        <View style={styles.cardFooterLeft}>
          <TouchableOpacity
            style={styles.cardFooterIcon}
            onPress={handleToggleLike}
            disabled={!user?.id || likeLoading}
          >
            <Image
              source={
                liked
                  ? require('../../../../assets/heartshaded.png')
                  : require('../../../../assets/heart.png')
              }
              style={styles.cardFooterIconImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
          {showCommentIcon && (
            <TouchableOpacity style={styles.cardFooterIcon} onPress={handlePressComments}>
              <Image
                source={require('../../../../assets/comment.png')}
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.cardFooterIcon}>
            <Image
              source={require('../../../../assets/share.png')}
              style={styles.cardFooterIconImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
        <View style={styles.cardFooterRight}>
          {isRead ? (
            <View style={styles.cardFooterIcon}>
              <Image
                source={require('../../../../assets/check.png')}
                style={[styles.cardFooterIconImage, { tintColor: actionTint }]}
                resizeMode="contain"
              />
            </View>
          ) : isCurrentlyReading ? (
            <View style={styles.cardFooterIcon}>
              <Image
                source={require('../../../../assets/reading.png')}
                style={[styles.cardFooterIconImage, { tintColor: actionTint }]}
                resizeMode="contain"
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.cardFooterIcon}
              onPress={onToggleWantToRead}
              disabled={!onToggleWantToRead}
            >
              <Image
                source={
                  isWantToRead
                    ? require('../../../../assets/shadedbookmark.png')
                    : require('../../../../assets/bookmark.png')
                }
                style={styles.cardFooterIconImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Timestamp */}
      <Text style={styles.cardTimestamp}>
        {formatActivityTimestamp(userBook.updated_at)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  cardUserText: {
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
    aspectRatio: 2 / 3,
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
  },
  readCountBadge: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  likesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  likesText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  commentsLinkText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  likesDivider: {
    borderTopWidth: 1,
    borderTopColor: `${colors.brownText}1A`,
    marginTop: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    marginBottom: 4,
  },
  cardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginLeft: -6,
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
});
