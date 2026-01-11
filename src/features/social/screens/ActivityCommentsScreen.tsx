import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CompositeNavigationProp,
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import { ActivityCommentsParams } from '../../../navigation/types';
import RecentActivityCard from '../components/RecentActivityCard';
import { supabase } from '../../../config/supabase';
import { UserBook } from '../../../services/books';
import {
  addComment,
  addReply,
  getActivityComments,
} from '../../../services/activityComments';
import { ActivityComment } from '../../../types/activityComments';
import {
  getCommentLikes,
  toggleCommentLike,
} from '../../../services/activityCommentLikes';
import { searchUsersForMention } from '../../../services/users';
import { UserMention } from '../../../types/users';

type ActivityCommentsRoute = RouteProp<
  { ActivityComments: ActivityCommentsParams },
  'ActivityComments'
>;

type CommentRow = {
  item: ActivityComment;
  isReply: boolean;
};

export default function ActivityCommentsScreen() {
  const { user: currentUser } = useAuth();
  type ActivityCommentsNavigation = CompositeNavigationProp<
    StackNavigationProp<ProfileStackParamList, 'ActivityComments'>,
    StackNavigationProp<SearchStackParamList, 'ActivityComments'>
  >;

  const navigation = useNavigation<ActivityCommentsNavigation>();
  const route = useRoute<ActivityCommentsRoute>();
  const { userBookId } = route.params;

  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<ActivityComment | null>(null);
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [likedKeys, setLikedKeys] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<UserMention[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const mentionRequestId = useRef(0);
  const [headerUserBook, setHeaderUserBook] = useState<UserBook | null>(
    route.params.userBook || null
  );
  const [headerActionText, setHeaderActionText] = useState<string>(
    route.params.actionText || ''
  );
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(
    route.params.avatarUrl || null
  );
  const [headerAvatarFallback, setHeaderAvatarFallback] = useState<string>(
    route.params.avatarFallback || 'U'
  );
  const [headerViewerStatus, setHeaderViewerStatus] = useState<
    'read' | 'currently_reading' | 'want_to_read' | null
  >(route.params.viewerStatus ?? null);
  const canMention = !!currentUser?.id;

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getActivityComments(userBookId);
      setComments(data);

      const commentIds = data.map((item) => item.id);
      const { likedIds } = await getCommentLikes(commentIds, currentUser?.id);
      const mergedCounts = new Map<string, number>();
      data.forEach((item) => {
        mergedCounts.set(item.id, item.likes_count ?? 0);
      });
      setLikeCounts(mergedCounts);
      setLikedKeys(likedIds);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, userBookId]);

  useFocusEffect(
    useCallback(() => {
      loadComments();
    }, [loadComments])
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

  const formatDateForDisplay = (dateString: string): string => {
    const date = new Date(`${dateString}T00:00:00`);
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
    if (!currentUser || !userBook.book) return;

    try {
      const { data: fullBook, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', userBook.book_id)
        .single();

      if (error) throw error;

      const { data: userBookData } = await supabase
        .from('user_books')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('book_id', fullBook.id)
        .single();

      navigation.navigate('BookDetail', {
        book: {
          ...fullBook,
          userBook: userBookData || null,
        },
      });
    } catch (error) {
      console.error('Error loading book details:', error);
      Alert.alert('Error', 'Could not load book details');
    }
  };

  const loadHeader = useCallback(async () => {
    if (route.params.userBook) {
      setHeaderUserBook(route.params.userBook);
      setHeaderActionText(route.params.actionText || getActionText(route.params.userBook.status));
      setHeaderAvatarUrl(route.params.avatarUrl || null);
      setHeaderAvatarFallback(route.params.avatarFallback || 'U');
      setHeaderViewerStatus(route.params.viewerStatus ?? null);
      return;
    }

    try {
      const { data: userBookData, error } = await supabase
        .from('user_books')
        .select(
          `
          *,
          book:books(*)
          `
        )
        .eq('id', userBookId)
        .single();

      if (error) throw error;

      const userBook = {
        ...userBookData,
        book: userBookData.book,
      } as UserBook;

      setHeaderUserBook(userBook);
      setHeaderActionText(getActionText(userBook.status));

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username, profile_photo_url')
        .eq('user_id', userBook.user_id)
        .single();

      setHeaderAvatarUrl(profile?.profile_photo_url || null);
      setHeaderAvatarFallback(
        profile?.username?.charAt(0)?.toUpperCase() || 'U'
      );
    } catch (error) {
      console.error('Error loading activity header:', error);
    }
  }, [route.params, userBookId]);

  useFocusEffect(
    useCallback(() => {
      loadHeader();
    }, [loadHeader])
  );

  const rows = useMemo<CommentRow[]>(() => {
    const topLevel = comments.filter((c) => !c.parent_comment_id);
    const repliesMap = new Map<string, ActivityComment[]>();
    comments
      .filter((c) => c.parent_comment_id)
      .forEach((c) => {
        const parentId = c.parent_comment_id as string;
        const existing = repliesMap.get(parentId) || [];
        existing.push(c);
        repliesMap.set(parentId, existing);
      });

    const ordered: CommentRow[] = [];
    topLevel.forEach((comment) => {
      ordered.push({ item: comment, isReply: false });
      const replies = repliesMap.get(comment.id) || [];
      replies.forEach((reply) => ordered.push({ item: reply, isReply: true }));
    });

    return ordered;
  }, [comments]);

  const handlePost = async () => {
    if (!currentUser?.id || posting) return;
    setPosting(true);
    try {
      let created: ActivityComment;
      if (replyTo) {
        const parentId = replyTo.parent_comment_id || replyTo.id;
        created = await addReply(userBookId, currentUser.id, parentId, commentText);
      } else {
        created = await addComment(userBookId, currentUser.id, commentText);
      }

      setCommentText('');
      setShowMentions(false);
      setMentionQuery('');
      setMentionStart(null);
      setMentionResults([]);
      setSelection({ start: 0, end: 0 });
      setActiveMentionIndex(0);
      setReplyTo(null);
      setComments((prev) => [...prev, created]);
      setLikeCounts((prev) => {
        const next = new Map(prev);
        next.set(created.id, 0);
        return next;
      });
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setPosting(false);
    }
  };

  const handleToggleLike = async (commentId: string) => {
    if (!currentUser?.id) return;
    try {
      const result = await toggleCommentLike(commentId, currentUser.id);
      setLikeCounts((prev) => {
        const next = new Map(prev);
        const current = next.get(commentId) || 0;
        next.set(commentId, Math.max(0, current + (result.liked ? 1 : -1)));
        return next;
      });
      setLikedKeys((prev) => {
        const next = new Set(prev);
        const key = `${commentId}:${currentUser.id}`;
        if (result.liked) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    } catch (error) {
      console.error('Error toggling comment like:', error);
    }
  };

  const handlePressCommentLikes = (commentId: string) => {
    navigation.navigate('ActivityLikes', { commentId });
  };

  const updateMentionState = (text: string, cursorPosition: number) => {
    const textUpToCursor = text.slice(0, cursorPosition);
    const match = textUpToCursor.match(/(^|\s)@([\w.]*)$/);
    if (!match) {
      setShowMentions(false);
      setMentionQuery('');
      setMentionStart(null);
      return;
    }

    const prefixLength = match[1]?.length ?? 0;
    const atIndex = (match.index ?? 0) + prefixLength;
    const query = match[2] ?? '';
    setMentionStart(atIndex);
    setMentionQuery(query);
    setShowMentions(query.length > 0);
  };

  const handleChangeText = (text: string) => {
    setCommentText(text);
    const cursorPosition = selection.end ?? text.length;
    const safeCursor =
      cursorPosition === 0 && text.length > 0
        ? text.length
        : Math.min(cursorPosition, text.length);
    updateMentionState(text, safeCursor);
  };

  const handleSelectionChange = (nextSelection: { start: number; end: number }) => {
    setSelection(nextSelection);
    updateMentionState(commentText, nextSelection.start);
  };

  const handleSelectMention = (user: UserMention) => {
    if (mentionStart === null) return;
    const cursorPosition = selection.end ?? commentText.length;
    const before = commentText.slice(0, mentionStart);
    const after = commentText.slice(cursorPosition);
    const insertion = `@${user.username} `;
    const nextText = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    setCommentText(nextText);
    setSelection({ start: nextCursor, end: nextCursor });
    setShowMentions(false);
    setMentionQuery('');
    setMentionStart(null);
    setMentionResults([]);
    setActiveMentionIndex(0);
  };

  const handleMentionKeyPress = (key: string) => {
    if (!showMentions || mentionResults.length === 0) return;
    if (key === 'ArrowDown') {
      setActiveMentionIndex((prev) => (prev + 1) % mentionResults.length);
    } else if (key === 'ArrowUp') {
      setActiveMentionIndex((prev) =>
        prev === 0 ? mentionResults.length - 1 : prev - 1
      );
    } else if (key === 'Enter') {
      const selectionItem = mentionResults[activeMentionIndex];
      if (selectionItem) {
        handleSelectMention(selectionItem);
      }
    }
  };

  const handleMentionPress = async (username: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, username')
        .eq('username', username)
        .single();

      if (error || !data) return;
      navigateToProfile(data.user_id, data.username);
    } catch (error) {
      console.error('Error navigating to mention profile:', error);
    }
  };

  const renderMentionText = (text: string) => {
    const parts: React.ReactNode[] = [];
    const mentionRegex = /@([A-Za-z0-9_]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(text)) !== null) {
      const start = match.index;
      const beforeChar = start > 0 ? text[start - 1] : '';
      if (beforeChar && !/\s/.test(beforeChar)) {
        continue;
      }

      if (start > lastIndex) {
        parts.push(
          <Text key={`text-${start}`} style={styles.commentText}>
            {text.slice(lastIndex, start)}
          </Text>
        );
      }

      const mentionUsername = match[1];
      parts.push(
        <Text
          key={`mention-${start}`}
          style={styles.mentionText}
          onPress={() => handleMentionPress(mentionUsername)}
        >
          @{mentionUsername}
        </Text>
      );

      lastIndex = start + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <Text key={`text-${lastIndex}`} style={styles.commentText}>
          {text.slice(lastIndex)}
        </Text>
      );
    }

    return parts.length ? parts : <Text style={styles.commentText}>{text}</Text>;
  };

  useEffect(() => {
    if (!currentUser?.id || !showMentions) {
      setMentionResults([]);
      setMentionLoading(false);
      return;
    }

    const requestId = ++mentionRequestId.current;
    setMentionLoading(true);

    const timeoutId = setTimeout(async () => {
      const results = await searchUsersForMention(
        mentionQuery,
        currentUser.id,
        10
      );

      if (mentionRequestId.current === requestId) {
        setMentionResults(results);
        setMentionLoading(false);
        setActiveMentionIndex(0);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [mentionQuery, showMentions, currentUser?.id]);

  const navigateToProfile = (userId: string, username: string) => {
    if (currentUser?.id === userId) return;
    navigation.navigate('UserProfile', {
      userId,
      username,
    });
  };

  const renderItem = ({ item }: { item: CommentRow }) => {
    const comment = item.item;
    const username = comment.user?.username || 'user';
    const avatarUrl = comment.user?.avatar_url || null;
    const isReply = item.isReply;
    const likeCount = likeCounts.get(comment.id) || 0;
    const likedKey = currentUser?.id ? `${comment.id}:${currentUser.id}` : '';
    const isLiked = likedKey ? likedKeys.has(likedKey) : false;

    return (
      <View style={[styles.commentRow, isReply && styles.replyRow]}>
        <TouchableOpacity
          onPress={() => navigateToProfile(comment.user_id, username)}
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
              onPress={() => navigateToProfile(comment.user_id, username)}
            >
              @{username}{' '}
            </Text>
            {renderMentionText(comment.comment_text)}
          </Text>
          <View style={styles.commentActions}>
            <TouchableOpacity
              onPress={() => setReplyTo(comment)}
              activeOpacity={0.7}
            >
              <Text style={styles.replyText}>Reply</Text>
            </TouchableOpacity>
            {likeCount > 0 && (
              <TouchableOpacity
                onPress={() => handlePressCommentLikes(comment.id)}
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
          onPress={() => handleToggleLike(comment.id)}
          activeOpacity={0.7}
        >
          <Image
            source={
              isLiked
                ? require('../../../../assets/heartshaded.png')
                : require('../../../../assets/heart.png')
            }
            style={styles.likeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comments</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            headerUserBook ? (
              <View style={styles.activityHeader}>
                <RecentActivityCard
                  userBook={headerUserBook}
                  actionText={headerActionText}
                  avatarUrl={headerAvatarUrl}
                  avatarFallback={headerAvatarFallback}
                  onPressBook={handleBookPress}
                  formatDateRange={formatDateRange}
                  viewerStatus={headerViewerStatus}
                  showCommentIcon={false}
                  showCommentsLink={false}
                />
              </View>
            ) : null
          }
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={styles.inputBar}>
          {currentUser?.user_metadata?.avatar_url ? (
            <Image
              source={{ uri: currentUser.user_metadata.avatar_url }}
              style={styles.inputAvatar}
            />
          ) : (
            <View style={styles.inputAvatarPlaceholder}>
              <Text style={styles.avatarText}>
                {(currentUser?.email?.charAt(0) || 'U').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.inputWrapper}>
            {replyTo && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>
                  Replying to @{replyTo.user?.username || 'user'}
                </Text>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Text style={styles.replyBannerClose}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            {showMentions && canMention && (
              <View style={styles.mentionList}>
                {mentionLoading ? (
                  <View style={styles.mentionLoadingRow}>
                    <ActivityIndicator size="small" color={colors.primaryBlue} />
                    <Text style={styles.mentionLoadingText}>Searching...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={mentionResults}
                    keyExtractor={(item) => item.user_id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item, index }) => (
                      <TouchableOpacity
                        style={[
                          styles.mentionItem,
                          index === activeMentionIndex && styles.mentionItemActive,
                        ]}
                        onPress={() => handleSelectMention(item)}
                        activeOpacity={0.7}
                      >
                        {item.avatar_url ? (
                          <Image
                            source={{ uri: item.avatar_url }}
                            style={styles.mentionAvatar}
                          />
                        ) : (
                          <View style={styles.mentionAvatarPlaceholder}>
                            <Text style={styles.avatarText}>
                              {item.username.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.mentionUsername}>@{item.username}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <View style={styles.mentionEmpty}>
                        <Text style={styles.mentionEmptyText}>No matches</Text>
                      </View>
                    }
                  />
                )}
              </View>
            )}
            <TextInput
              style={styles.textInput}
              placeholder="Comment or tag a friend"
              placeholderTextColor={`${colors.brownText}99`}
              value={commentText}
              onChangeText={handleChangeText}
              onSelectionChange={(event) =>
                handleSelectionChange(event.nativeEvent.selection)
              }
              onKeyPress={(event) => handleMentionKeyPress(event.nativeEvent.key)}
              onBlur={() => setShowMentions(false)}
              selection={selection}
              multiline
            />
          </View>
          <TouchableOpacity
            onPress={handlePost}
            disabled={posting || !commentText.trim()}
          >
            <Text
              style={[
                styles.postButton,
                (posting || !commentText.trim()) && styles.postButtonDisabled,
              ]}
            >
              Post
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  activityHeader: {
    marginBottom: 16,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  replyRow: {
    paddingLeft: 36,
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
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inputAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  inputAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  commentContent: {
    flex: 1,
    paddingRight: 8,
  },
  usernameText: {
    fontSize: 15,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  inlineCommentText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  commentText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  mentionText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  replyText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  likeCountText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  likeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeIcon: {
    width: 18,
    height: 18,
    tintColor: colors.brownText,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: `${colors.brownText}1A`,
    backgroundColor: colors.creamBackground,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  mentionList: {
    maxHeight: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.brownText}1A`,
    backgroundColor: colors.white,
    marginBottom: 8,
    overflow: 'hidden',
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mentionItemActive: {
    backgroundColor: `${colors.primaryBlue}14`,
  },
  mentionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  mentionAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.creamBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mentionUsername: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  mentionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  mentionLoadingText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  mentionEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mentionEmptyText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  textInput: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    maxHeight: 100,
  },
  postButton: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  postButtonDisabled: {
    opacity: 0.4,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${colors.primaryBlue}14`,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 6,
  },
  replyBannerText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.primaryBlue,
  },
  replyBannerClose: {
    fontSize: 16,
    color: colors.primaryBlue,
  },
});
