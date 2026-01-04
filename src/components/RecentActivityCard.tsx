import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography } from '../config/theme';
import { UserBook } from '../services/books';
import { getScoreColor, formatScore } from '../utils/rankScoreColors';

type RecentActivityCardProps = {
  userBook: UserBook;
  actionText: string;
  avatarUrl?: string | null;
  avatarFallback: string;
  onPressBook: (userBook: UserBook) => void;
  formatDateRange: (startDate: string | null, endDate: string | null) => string | null;
  formatDayOfWeek: (dateString: string) => string;
  viewerStatus?: 'read' | 'currently_reading' | 'want_to_read' | null;
  onToggleWantToRead?: () => void;
};

export default function RecentActivityCard({
  userBook,
  actionText,
  avatarUrl,
  avatarFallback,
  onPressBook,
  formatDateRange,
  formatDayOfWeek,
  viewerStatus = null,
  onToggleWantToRead,
}: RecentActivityCardProps) {
  const book = userBook.book;
  if (!book) return null;
  const isRead = viewerStatus === 'read';
  const isCurrentlyReading = viewerStatus === 'currently_reading';
  const isWantToRead = viewerStatus === 'want_to_read';
  const actionTint = getScoreColor(10);

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

      {/* Book info section */}
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
          {isRead ? (
            <View style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/check.png')}
                style={[styles.cardFooterIconImage, { tintColor: actionTint }]}
                resizeMode="contain"
              />
            </View>
          ) : isCurrentlyReading ? (
            <View style={styles.cardFooterIcon}>
              <Image
                source={require('../../assets/reading.png')}
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
                    ? require('../../assets/shadedbookmark.png')
                    : require('../../assets/bookmark.png')
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
        {formatDayOfWeek(userBook.updated_at)}
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
    opacity: 0.8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: `${colors.brownText}1A`,
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
