import type { UserBook } from '../services/books';

export interface ActivityFeedUser {
  user_id: string;
  username: string;
  profile_photo_url: string | null;
}

export interface ActivityFeedItem {
  id: string;
  created_at: string;
  content: string;
  image_url: string | null;
  user: ActivityFeedUser;
  userBook: UserBook;
}

export interface ActivityFeedCursor {
  createdAt: string;
  id: string;
}
