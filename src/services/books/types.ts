export interface GoogleBook {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    averageRating?: number;
    ratingsCount?: number;
    language?: string;
    imageLinks?: {
      extraLarge?: string;
      large?: string;
      medium?: string;
      small?: string;
      thumbnail?: string;
      smallThumbnail?: string;
    };
    previewLink?: string;
    infoLink?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
  };
}

export interface Book {
  id: string;
  google_books_id: string | null;
  open_library_id: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  published_date: string | null;
  first_published: number | null;
  description: string | null;
  page_count: number | null;
  categories: string[] | null;
  genres: string[] | null; // Mapped preset genres from API categories
  average_rating: number | null;
  ratings_count: number | null;
  language: string | null;
  cover_url: string | null;
  cover_fetched_at?: string | null;
  preview_link: string | null;
  info_link: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  community_average_score: number | null;
  community_rank_count: number;
  stats_last_updated: string | null;
  created_at: string;
}

export interface ReadSession {
  id: string;
  user_book_id: string;
  started_date: string | null;
  finished_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserBook {
  id: string;
  user_id: string;
  book_id: string;
  rank_score: number | null;
  status: 'read' | 'currently_reading' | 'want_to_read' | null;
  rating?: 'liked' | 'fine' | 'disliked';
  notes?: string | null;
  custom_labels?: string[] | null; // Per-user custom tags
  user_genres?: string[] | null; // Per-user genre overrides (null = use book defaults)
  started_date?: string | null; // DEPRECATED: Use read_sessions instead
  finished_date?: string | null; // DEPRECATED: Use read_sessions instead
  read_sessions?: ReadSession[]; // NEW: Multiple date ranges
  likes_count?: number | null;
  comments_count?: number | null;
  progress_percent: number;
  last_progress_update?: string | null;
  created_at: string;
  updated_at: string;
  book?: Book;
}

export interface BookCircleStats {
  average: number | null;
  count: number;
}

export interface BookCirclesResult {
  global: BookCircleStats;
  friends: BookCircleStats;
}

export interface FriendProfile {
  user_id: string;
  username: string;
  profile_photo_url: string | null;
}

export interface FriendsLikedBook {
  book_id: string;
  book: Book;
  average_score: number | null;
  friends_count: number;
  friends: FriendProfile[];
  most_recent_updated_at: string;
}

export interface BookShelfCounts {
  read: number;
  currently_reading: number;
  want_to_read: number;
}
