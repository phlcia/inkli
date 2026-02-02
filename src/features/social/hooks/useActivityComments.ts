import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../../config/supabase';
import type { User } from '@supabase/supabase-js';
import type { UserBook } from '../../../services/books';
import {
  addComment,
  addReply,
  getActivityComments,
} from '../../../services/activityComments';
import type { ActivityComment } from '../../../types/activityComments';
import {
  getCommentLikes,
  toggleCommentLike,
} from '../../../services/activityCommentLikes';
import { searchUsersForMention } from '../../../services/users';
import type { UserMention } from '../../../types/users';
import { getActionText } from '../../../utils/activityText';

export type CommentRow = {
  item: ActivityComment;
  isReply: boolean;
};

type HeaderParams = {
  userBook?: UserBook | null;
  actionText?: string;
  avatarUrl?: string | null;
  avatarFallback?: string;
  viewerStatus?: 'read' | 'currently_reading' | 'want_to_read' | null;
};

export function useActivityComments(params: {
  currentUser: User | null | undefined;
  userBookId: string;
  headerParams: HeaderParams;
}) {
  const { currentUser, userBookId, headerParams } = params;
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
    headerParams.userBook || null
  );
  const [headerActionText, setHeaderActionText] = useState<string>(
    headerParams.actionText || ''
  );
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(
    headerParams.avatarUrl || null
  );
  const [headerAvatarFallback, setHeaderAvatarFallback] = useState<string>(
    headerParams.avatarFallback || 'U'
  );
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(
    currentUser?.user_metadata?.avatar_url || null
  );
  const [currentUserAvatarFallback, setCurrentUserAvatarFallback] = useState<string>(
    (currentUser?.email?.charAt(0) || 'U').toUpperCase()
  );
  const [headerViewerStatus, setHeaderViewerStatus] = useState<
    'read' | 'currently_reading' | 'want_to_read' | null
  >(headerParams.viewerStatus ?? null);

  const loadComments = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true);
        }
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
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [currentUser?.id, userBookId]
  );

  useFocusEffect(
    useCallback(() => {
      loadComments();
    }, [loadComments])
  );

  const loadHeader = useCallback(async () => {
    if (headerParams.userBook) {
      setHeaderUserBook(headerParams.userBook);
      setHeaderActionText(
        headerParams.actionText ||
          getActionText({
            status: headerParams.userBook.status,
            isSelf: true,
            hasProgressUpdate: !!headerParams.userBook.last_progress_update,
            progressPercent: headerParams.userBook.progress_percent,
          })
      );
      setHeaderAvatarUrl(headerParams.avatarUrl || null);
      setHeaderAvatarFallback(headerParams.avatarFallback || 'U');
      setHeaderViewerStatus(headerParams.viewerStatus ?? null);
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
      setHeaderActionText(
        getActionText({
          status: userBook?.status,
          isSelf: true,
          hasProgressUpdate: !!userBook?.last_progress_update,
          progressPercent: userBook?.progress_percent,
        })
      );

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
  }, [headerParams, userBookId]);

  useEffect(() => {
    setCurrentUserAvatarUrl(currentUser?.user_metadata?.avatar_url || null);
    setCurrentUserAvatarFallback(
      (currentUser?.email?.charAt(0) || 'U').toUpperCase()
    );
  }, [currentUser?.email, currentUser?.user_metadata?.avatar_url]);

  const loadCurrentUserProfile = useCallback(async () => {
    if (!currentUser?.id) return;

    const metadataAvatar = currentUser.user_metadata?.avatar_url || null;
    if (metadataAvatar) {
      setCurrentUserAvatarUrl(metadataAvatar);
      setCurrentUserAvatarFallback(
        (currentUser.email?.charAt(0) || 'U').toUpperCase()
      );
      return;
    }

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username, profile_photo_url')
        .eq('user_id', currentUser.id)
        .single();

      setCurrentUserAvatarUrl(profile?.profile_photo_url || null);
      setCurrentUserAvatarFallback(
        profile?.username?.charAt(0)?.toUpperCase() ||
          (currentUser.email?.charAt(0) || 'U').toUpperCase()
      );
    } catch (error) {
      console.error('Error loading current user profile:', error);
    }
  }, [currentUser?.id, currentUser?.email, currentUser?.user_metadata?.avatar_url]);

  useFocusEffect(
    useCallback(() => {
      loadHeader();
      loadCurrentUserProfile();
    }, [loadHeader, loadCurrentUserProfile])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadHeader(), loadComments(false)]);
    } finally {
      setRefreshing(false);
    }
  }, [loadComments, loadHeader]);

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

  const updateMentionState = (text: string, cursorPosition: number) => {
    const textUpToCursor = text.slice(0, cursorPosition);
    const match = textUpToCursor.match(/(^|[^A-Za-z0-9_])@([A-Za-z0-9_.]*)$/);
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
    setShowMentions(true);
  };

  const handleChangeText = (text: string) => {
    setCommentText(text);
    const safeCursor = text.length;
    updateMentionState(text, safeCursor);
  };

  const handleSelectionChange = (nextSelection: { start: number; end: number }) => {
    setSelection(nextSelection);
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

  useEffect(() => {
    if (!currentUser?.id || !showMentions) {
      setMentionResults([]);
      setMentionLoading(false);
      return;
    }

    if (!mentionQuery.trim()) {
      setMentionResults([]);
      setMentionLoading(false);
      setActiveMentionIndex(0);
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

  return {
    comments,
    rows,
    loading,
    refreshing,
    commentText,
    posting,
    replyTo,
    likeCounts,
    likedKeys,
    mentionResults,
    showMentions,
    mentionLoading,
    selection,
    activeMentionIndex,
    headerUserBook,
    headerActionText,
    headerAvatarUrl,
    headerAvatarFallback,
    headerViewerStatus,
    currentUserAvatarUrl,
    currentUserAvatarFallback,
    setReplyTo,
    setShowMentions,
    handleRefresh,
    handlePost,
    handleToggleLike,
    handleChangeText,
    handleSelectionChange,
    handleSelectMention,
    handleMentionKeyPress,
  };
}
