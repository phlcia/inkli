import type { UserBook } from '../services/books';

export type FollowersFollowingParams = {
  userId: string;
  username?: string;
  initialTab: 'followers' | 'following';
};

export type ActivityLikesParams = {
  userBookId?: string;
  commentId?: string;
};

export type ActivityCommentsParams = {
  userBookId: string;
  userBook?: UserBook;
  actionText?: string;
  avatarUrl?: string | null;
  avatarFallback?: string;
  viewerStatus?: 'read' | 'currently_reading' | 'want_to_read' | null;
};

export type BookRankingParams = {
  book: any;
  userBookId: string;
  initialStatus: 'read' | 'currently_reading' | 'want_to_read';
  previousStatus?: 'read' | 'currently_reading' | 'want_to_read' | null;
  wasNewBook?: boolean;
  isNewInstance?: boolean;
  openComparisonOnLoad?: boolean;
};
