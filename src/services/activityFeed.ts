import { supabase } from '../config/supabase';
import { ActivityFeedCursor, ActivityFeedItem } from '../types/activityCards';
import type { Book, UserBook } from './books';

type FeedSource = 'activity_cards' | 'user_books' | 'auto';

interface ActivityCardRow {
  activity_id: string;
  activity_created_at: string;
  activity_content: string;
  activity_image_url: string | null;
  user_id: string;
  username: string;
  profile_photo_url: string | null;
  user_book_id: string;
  user_book_status: UserBook['status'];
  user_book_rank_score: number | null;
  user_book_rating: UserBook['rating'] | null;
  user_book_notes: string | null;
  user_book_started_date: string | null;
  user_book_finished_date: string | null;
  user_book_likes_count: number | null;
  user_book_comments_count: number | null;
  user_book_created_at: string;
  user_book_updated_at: string;
  book_id: string;
  book_title: string;
  book_authors: string[];
  book_cover_url: string | null;
}

const FEED_SOURCE = (process.env.EXPO_PUBLIC_FEED_SOURCE || 'activity_cards') as FeedSource;

const mapRowsToItems = (rows: ActivityCardRow[]): ActivityFeedItem[] =>
  rows.map((row) => {
    const book = {
      id: row.book_id,
      title: row.book_title,
      authors: row.book_authors || [],
      cover_url: row.book_cover_url,
    } as Book;

    const userBook: UserBook = {
      id: row.user_book_id,
      user_id: row.user_id,
      book_id: row.book_id,
      rank_score: row.user_book_rank_score,
      status: row.user_book_status,
      rating: row.user_book_rating ?? undefined,
      notes: row.user_book_notes ?? undefined,
      started_date: row.user_book_started_date ?? undefined,
      finished_date: row.user_book_finished_date ?? undefined,
      likes_count: row.user_book_likes_count ?? undefined,
      comments_count: row.user_book_comments_count ?? undefined,
      created_at: row.user_book_created_at,
      updated_at: row.user_book_updated_at,
      book,
    };

    return {
      id: row.activity_id,
      created_at: row.activity_created_at,
      content: row.activity_content,
      image_url: row.activity_image_url,
      user: {
        user_id: row.user_id,
        username: row.username,
        profile_photo_url: row.profile_photo_url,
      },
      userBook,
    };
  });

const dedupeByShelf = (cards: ActivityFeedItem[]): ActivityFeedItem[] => {
  const seen = new Set<string>();
  const result: ActivityFeedItem[] = [];

  for (const card of cards) {
    const status = card.userBook.status ?? 'unknown';
    const key = `${card.userBook.id}:${status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }

  return result;
};

async function fetchActivityCardsFromActivityTable(
  userId: string,
  limit: number,
  cursor: ActivityFeedCursor | null
): Promise<{ cards: ActivityFeedItem[]; nextCursor: ActivityFeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_followed_activity_cards', {
    p_user_id: userId,
    p_limit: limit,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });

  if (error) {
    throw error;
  }

  const rows = (data as ActivityCardRow[]) || [];
  const cards = dedupeByShelf(mapRowsToItems(rows));

  const last = cards[cards.length - 1];
  const nextCursor = last
    ? { createdAt: last.created_at, id: last.id }
    : null;

  return { cards, nextCursor };
}

async function fetchActivityCardsFromUserBooks(
  userId: string,
  limit: number,
  cursor: ActivityFeedCursor | null
): Promise<{ cards: ActivityFeedItem[]; nextCursor: ActivityFeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_followed_user_books_activity', {
    p_user_id: userId,
    p_limit: limit,
    p_cursor_updated_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });

  if (error) {
    throw error;
  }

  const rows = (data as ActivityCardRow[]) || [];
  const cards = dedupeByShelf(mapRowsToItems(rows));

  const last = cards[cards.length - 1];
  const nextCursor = last
    ? { createdAt: last.created_at, id: last.id }
    : null;

  return { cards, nextCursor };
}

export async function fetchFollowedActivityCards(
  userId: string,
  options?: {
    limit?: number;
    cursor?: ActivityFeedCursor | null;
  }
): Promise<{ cards: ActivityFeedItem[]; nextCursor: ActivityFeedCursor | null }> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor ?? null;

  if (FEED_SOURCE === 'user_books') {
    return fetchActivityCardsFromUserBooks(userId, limit, cursor);
  }

  if (FEED_SOURCE === 'activity_cards') {
    return fetchActivityCardsFromActivityTable(userId, limit, cursor);
  }

  const primary = await fetchActivityCardsFromActivityTable(userId, limit, cursor);
  const shouldFallback = primary.cards.length === 0 && !cursor;
  if (shouldFallback) {
    return fetchActivityCardsFromUserBooks(userId, limit, cursor);
  }

  return primary;
}

type UserActivityCardRow = {
  id: string;
  created_at: string;
  content: string;
  image_url: string | null;
  user_id: string;
  user_book_id: string | null;
  user_book: UserBook | null;
};

export async function fetchUserActivityCards(
  userId: string,
  options?: { limit?: number }
): Promise<ActivityFeedItem[]> {
  const limit = options?.limit ?? 20;

  const { data, error } = await supabase
    .from('activity_cards')
    .select(
      `
      id,
      created_at,
      content,
      image_url,
      user_id,
      user_book_id,
      user_book:user_book_id (
        *,
        book:books(*)
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows = (data as UserActivityCardRow[]) || [];

  return dedupeByShelf(rows
    .map((row) => {
      if (!row.user_book || !row.user_book.book) return null;
      return {
        id: row.id,
        created_at: row.created_at,
        content: row.content,
        image_url: row.image_url,
        user: {
          user_id: row.user_id,
          username: '',
          profile_photo_url: null,
        },
        userBook: {
          ...row.user_book,
          book: row.user_book.book as Book,
        },
      } as ActivityFeedItem;
    })
    .filter((item): item is ActivityFeedItem => Boolean(item)));
}
