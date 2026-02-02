import { supabase } from '../../config/supabase';
import { getSuggestedGenres } from '../../utils/genreMapper';
import type { Book, ReadSession, UserBook } from './types';
import { upsertBookViaEdge } from './upsert';

/**
 * Check if user already has this book
 */
export async function checkUserHasBook(
  bookId: string,
  userId: string
): Promise<{ exists: boolean; userBookId?: string; currentStatus?: string }> {
  try {
    const { data: existingUserBook } = await supabase
      .from('user_books')
      .select('id, status')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .single();

    if (existingUserBook) {
      return {
        exists: true,
        userBookId: existingUserBook.id,
        currentStatus: existingUserBook.status,
      };
    }
    return { exists: false };
  } catch (_error) {
    // If no record found, return false
    return { exists: false };
  }
}

/**
 * Add a book to user's shelf
 * Creates book record if it doesn't exist, then creates user_books entry
 * Accepts enriched book data (from enrichBookWithGoogleBooks)
 * Status can be null to save the book without adding to a shelf (e.g., just adding tags)
 * Returns: { userBookId, isUpdate: boolean, previousStatus?: string }
 */
export async function addBookToShelf(
  bookData: any, // Enriched book data from enrichBookWithGoogleBooks
  status: 'read' | 'currently_reading' | 'want_to_read' | null,
  userId: string,
  options?: {
    rating?: 'liked' | 'fine' | 'disliked';
    notes?: string;
    genres?: string[]; // User-selected genres (from GenreLabelPicker) - saved to user_books
    custom_labels?: string[]; // User-selected custom labels
  }
): Promise<{ userBookId: string; isUpdate: boolean; previousStatus?: string }> {
  try {
    // Auto-map genres from API categories for book defaults (stored on books table)
    const defaultGenres = await getSuggestedGenres(bookData.categories);

    // Prepare book data with default genres (stored on books table for all users)
    const bookDataWithGenres = {
      ...bookData,
      genres: defaultGenres, // Store auto-mapped genres as book defaults
    };

    const { book_id: bookId } = await upsertBookViaEdge(bookDataWithGenres);

    // User-selected genres will be stored on user_books.user_genres (per-user)
    // If user selected genres, use those; otherwise null means "use book defaults"
    const userGenres = (options?.genres && options.genres.length > 0) ? options.genres : null;

    // Check if user already has this book
    const existingCheck = await checkUserHasBook(bookId, userId);

    if (existingCheck.exists && existingCheck.userBookId) {
      // Book already exists - update it instead of inserting
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (existingCheck.currentStatus === 'read' && status !== 'read') {
        updateData.rank_score = null;
      }
      if (options?.rating !== undefined) {
        updateData.rating = options.rating;
      }
      if (options?.notes !== undefined) {
        updateData.notes = options.notes;
      }
      if (options?.custom_labels !== undefined) {
        updateData.custom_labels = options.custom_labels;
      }
      // Save user-selected genres to user_books (per-user)
      if (userGenres !== null) {
        updateData.user_genres = userGenres;
      }

      const { error: updateError } = await supabase
        .from('user_books')
        .update(updateData)
        .eq('id', existingCheck.userBookId);

      if (updateError) throw updateError;

      return {
        userBookId: existingCheck.userBookId,
        isUpdate: true,
        previousStatus: existingCheck.currentStatus,
      };
    }

    // Book doesn't exist - proceed with insert
    // rank_score will be set later during ranking process
    // Insert user_books entry with optional fields
    const userBookData: any = {
      user_id: userId,
      book_id: bookId,
      status,
      rank_score: null, // Will be set during ranking
    };

    if (options?.rating) {
      userBookData.rating = options.rating;
    }
    if (options?.notes) {
      userBookData.notes = options.notes;
    }
    if (options?.custom_labels) {
      userBookData.custom_labels = options.custom_labels;
    }
    // Save user-selected genres to user_books (per-user)
    if (userGenres !== null) {
      userBookData.user_genres = userGenres;
    }

    const { data: newUserBook, error: userBookError } = await supabase
      .from('user_books')
      .insert(userBookData)
      .select('id')
      .single();

    if (userBookError) {
      // Check if it's a unique constraint violation
      if (userBookError.code === '23505') {
        // Book was added between check and insert - try to get existing
        const retryCheck = await checkUserHasBook(bookId, userId);
        if (retryCheck.exists && retryCheck.userBookId) {
          // Update the existing record
          const updateData: any = {
            status,
            updated_at: new Date().toISOString(),
          };
          if (options?.rating !== undefined) updateData.rating = options.rating;
          if (options?.notes !== undefined) updateData.notes = options.notes;
          if (options?.custom_labels !== undefined) updateData.custom_labels = options.custom_labels;
          if (userGenres !== null) updateData.user_genres = userGenres;

          await supabase
            .from('user_books')
            .update(updateData)
            .eq('id', retryCheck.userBookId);

          return {
            userBookId: retryCheck.userBookId,
            isUpdate: true,
            previousStatus: retryCheck.currentStatus,
          };
        }
      }
      throw userBookError;
    }

    if (status === 'currently_reading') {
      await initializeReadingProgress(userId, bookId);
    }

    return {
      userBookId: newUserBook.id,
      isUpdate: false,
    };
  } catch (error) {
    console.error('Error adding book to shelf:', error);
    throw error;
  }
}

function normalizeProgressPercent(progressPercent: number): number {
  const rounded = Math.round(progressPercent);
  return Math.max(0, Math.min(100, rounded));
}

function isProgressActivityContent(content?: string | null): boolean {
  if (!content) return false;
  const normalized = content.trim().toLowerCase();
  return (
    (normalized.startsWith('is ') &&
      (normalized.includes('% through'))) ||
    normalized.startsWith('finished reading')
  );
}

export async function updateReadingProgress(
  userId: string,
  bookId: string,
  progressPercent: number,
  createActivity: boolean = true
): Promise<UserBook | null> {
  const normalized = normalizeProgressPercent(progressPercent);

  try {
    const { data: existing, error: existingError } = await supabase
      .from('user_books')
      .select('id, status, progress_percent, book:books(title, cover_url)')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .single();

    if (existingError) {
      console.error('Error fetching existing progress:', existingError);
      return null;
    }

    if (!existing || existing.status !== 'currently_reading') {
      return null;
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_books')
      .update({ progress_percent: normalized })
      .eq('id', existing.id)
      .eq('status', 'currently_reading')
      .select('*, book:books(*)')
      .single();

    if (updateError) {
      console.error('Error updating reading progress:', updateError);
      throw updateError;
    }

    if (createActivity) {
      const previous = normalizeProgressPercent(existing.progress_percent ?? 0);
      const hasChanged = previous !== normalized;

      if (hasChanged) {
        const content =
          normalized === 100 ? 'finished reading' : `is ${normalized}% through`;

        if (isProgressActivityContent(content)) {
          const { error: activityError } = await supabase
            .from('activity_cards')
            .insert({
            user_id: userId,
            user_book_id: existing.id,
            content,
            image_url: updated?.book?.cover_url ?? null,
          })
          .select('id');
          if (activityError) {
            console.error('Error creating progress activity card:', activityError);
          }
        }
      }
    }

    return updated as UserBook;
  } catch (error) {
    console.error('Error updating reading progress:', error);
    throw error;
  }
}

export async function getReadingProgress(
  userId: string,
  bookId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_books')
      .select('progress_percent')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .single();

    if (error) {
      console.error('Error fetching reading progress:', error);
      return 0;
    }

    return normalizeProgressPercent(data?.progress_percent ?? 0);
  } catch (error) {
    console.error('Error fetching reading progress:', error);
    return 0;
  }
}

export async function initializeReadingProgress(
  userId: string,
  bookId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_books')
      .update({ progress_percent: 0 })
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .eq('status', 'currently_reading');

    if (error) {
      console.error('Error initializing reading progress:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error initializing reading progress:', error);
    throw error;
  }
}

/**
 * Get all books for a user, ordered by rank_score within rating categories
 */
export async function getUserBooks(userId: string): Promise<UserBook[]> {
  try {

    const { data, error } = await supabase
      .from('user_books')
      .select(
        `
        *,
        book:books(*)
      `
      )
      .eq('user_id', userId)
      .order('rating', { ascending: true, nullsFirst: true })
      .order('rank_score', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('=== getUserBooks ERROR ===', error);
      throw error;
    }

    return (data || []).map((item) => ({
      ...item,
      book: item.book as Book,
    })) as UserBook[];
  } catch (error) {
    console.error('Error fetching user books:', error);
    throw error;
  }
}

/**
 * Batch update rank_score for multiple books in a tier
 * Used when redistribution happens
 */
export async function updateTierScoresBatch(
  userId: string,
  tier: 'liked' | 'fine' | 'disliked',
  updatedBooks: { id: string; score: number }[],
  options?: {
    touchUpdatedAt?: boolean;
  }
): Promise<void> {
  try {
    if (updatedBooks.length === 0) {
      return;
    }

    // Verify all books belong to this user
    const { data: existingBooks, error: fetchError } = await supabase
      .from('user_books')
      .select('id')
      .eq('user_id', userId)
      .in('id', updatedBooks.map(u => u.id))
      .eq('rating', tier);

    if (fetchError) throw fetchError;

    if (!existingBooks || existingBooks.length !== updatedBooks.length) {
      throw new Error('Not all books belong to user or tier');
    }

    if (options?.touchUpdatedAt === false) {
      const { error: rpcError } = await supabase.rpc('update_user_book_rank_scores_no_touch', {
        p_user_id: userId,
        p_updates: updatedBooks,
      });
      if (rpcError) {
        throw rpcError;
      }
      return;
    }

    const updatePromises = updatedBooks.map(book =>
      supabase
        .from('user_books')
        .update({
          rank_score: book.score,
        })
        .eq('id', book.id)
        .eq('user_id', userId)
    );

    const results = await Promise.all(updatePromises);
    const errors = results.filter(r => r.error).map(r => r.error);

    if (errors.length > 0) {
      throw new Error(`Batch update failed: ${errors.map(e => e?.message).join(', ')}`);
    }
  } catch (error) {
    console.error('Error updating tier scores batch:', error);
    throw error;
  }
}

/**
 * Update book status (read, currently_reading, want_to_read)
 */
export async function updateBookStatus(
  userBookId: string,
  newStatus: 'read' | 'currently_reading' | 'want_to_read' | null,
  options?: {
    clearRankScore?: boolean;
    touchUpdatedAt?: boolean;
  }
): Promise<{ data: any; error: any }> {
  try {
    if (options?.touchUpdatedAt === false) {
      const { data, error } = await supabase.rpc('update_user_book_status_no_touch', {
        p_user_book_id: userBookId,
        p_status: newStatus,
        p_clear_rank_score: options?.clearRankScore ?? false,
      });
      if (error) {
        console.error('updateBookStatus: no-touch RPC error', error);
      }
      return { data, error };
    }

    const updateData: {
      status: 'read' | 'currently_reading' | 'want_to_read' | null;
      updated_at?: string;
      rank_score?: null;
    } = {
      status: newStatus,
    };

    if (options?.touchUpdatedAt !== false) {
      updateData.updated_at = new Date().toISOString();
    }

    if (options?.clearRankScore) {
      updateData.rank_score = null;
    }

    const { data, error } = await supabase
      .from('user_books')
      .update(updateData)
      .eq('id', userBookId);

    return { data, error };
  } catch (error) {
    console.error('Error updating book status:', error);
    throw error;
  }
}

/**
 * Get default score for a rating category (max score for tier)
 */
function getDefaultScoreForRating(rating: 'liked' | 'fine' | 'disliked'): number {
  switch (rating) {
    case 'liked':
      return 10.0;
    case 'fine':
      return 6.5;
    case 'disliked':
      return 3.5;
  }
}

/**
 * Update user book with rating, notes, and dates
 * If rating is set and rank_score is null, check if this is the first book in category
 * If so, set default score; otherwise leave null for ranking process
 *
 * NOTE: Use read_sessions (addReadSession, updateReadSession, deleteReadSession) for dates.
 */
export async function updateUserBookDetails(
  userBookId: string,
  userId: string,
  updates: {
    status?: 'read' | 'currently_reading' | 'want_to_read' | null;
    rating?: 'liked' | 'fine' | 'disliked' | null;
    notes?: string | null;
    custom_labels?: string[] | null;
    user_genres?: string[] | null; // Per-user genre overrides
  },
  options?: {
    touchUpdatedAt?: boolean;
  }
): Promise<{ data: any; error: any }> {
  try {
    if (options?.touchUpdatedAt === false) {
      // Only pass rating and notes to the RPC (dates are handled separately via read_sessions)
      const { data, error } = await supabase.rpc('update_user_book_details_no_touch', {
        p_user_book_id: userBookId,
        p_set_rating: updates.rating !== undefined,
        p_rating: updates.rating ?? null,
        p_set_notes: updates.notes !== undefined,
        p_notes: updates.notes ?? null,
      });
      if (error) {
        console.error('updateUserBookDetails: no-touch RPC error', error);
      }
      return { data, error };
    }

    const updateData: any = {
    };

    // Only update timestamp when status (shelf) is being changed
    // Notes, rating, and dates should NOT change the timestamp
    if (updates.status !== undefined && options?.touchUpdatedAt !== false) {
      updateData.updated_at = new Date().toISOString();
    } else if (options?.touchUpdatedAt === true) {
      // Explicitly requested to touch updated_at (for backward compatibility)
      updateData.updated_at = new Date().toISOString();
    }

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.rating !== undefined) {
      updateData.rating = updates.rating;

      // If rating is being set and rank_score is null, check if this is first in category
      if (updates.rating !== null) {
        // Get current book to check if it already has rank_score
        const { data: currentBook } = await supabase
          .from('user_books')
          .select('rank_score, rating')
          .eq('id', userBookId)
          .single();

        // Only set rank_score if:
        // 1. Current rank_score is null (not already set)
        // 2. Rating is actually changing (not just re-saving the same rating)
        const isRatingChanging = currentBook?.rating !== updates.rating;

        if (!currentBook?.rank_score && isRatingChanging) {
          const { data: categoryBooks } = await supabase
            .from('user_books')
            .select('id')
            .eq('user_id', userId)
            .eq('rating', updates.rating)
            .neq('id', userBookId)
            .not('rank_score', 'is', null);

          // If this is the first book in category, set default score
          if (!categoryBooks || categoryBooks.length === 0) {
            updateData.rank_score = getDefaultScoreForRating(updates.rating);
          }
          // Otherwise, rank_score stays null and will be set during ranking
        }
        // If rank_score is already set, don't touch it
        // If rating is not changing, don't touch rank_score
      } else {
        // If rating is being removed, also remove rank_score
        updateData.rank_score = null;
      }
    }
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.custom_labels !== undefined) updateData.custom_labels = updates.custom_labels;
    if (updates.user_genres !== undefined) updateData.user_genres = updates.user_genres;
    // Dates are handled via read_sessions; user_books no longer stores them.


    const { data, error } = await supabase
      .from('user_books')
      .update(updateData)
      .eq('id', userBookId);

    if (error) {
      console.error('=== updateUserBookDetails: update error ===', error);
    }

    return { data, error };
  } catch (error) {
    console.error('Error updating user book details:', error);
    throw error;
  }
}

/**
 * Remove book from shelf
 */
export async function removeBookFromShelf(
  userBookId: string
): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('user_books')
      .delete()
      .eq('id', userBookId);

    return { error };
  } catch (error) {
    console.error('Error removing book from shelf:', error);
    throw error;
  }
}

/**
 * Redistribute ranks for all books in a specific rating category
 * Called when a book with max score (10.0, 6.5, or 3.5) is removed
 */
export async function redistributeRanksForRating(
  userId: string,
  rating: 'liked' | 'fine' | 'disliked'
): Promise<{ error: any }> {
  try {
    // Tier score boundaries
    const TIER_BOUNDARIES = {
      disliked: { min: 0, max: 3.5 },
      fine: { min: 3.5, max: 6.5 },
      liked: { min: 6.5, max: 10.0 },
    } as const;

    const roundScore = (score: number): number => {
      return Math.round(score * 1000) / 1000;
    };

    // Get all books with this rating for the user that have rank_score
    const { data: books, error: fetchError } = await supabase
      .from('user_books')
      .select('id, rank_score')
      .eq('user_id', userId)
      .eq('rating', rating)
      .eq('status', 'read')
      .not('rank_score', 'is', null)
      .order('rank_score', { ascending: false });

    if (fetchError) {
      console.error('Error fetching books for redistribution:', fetchError);
      return { error: fetchError };
    }

    if (!books || books.length === 0) {
      // No books to redistribute
      return { error: null };
    }

    // Determine tier boundaries
    const tier = rating === 'liked' ? 'liked' : rating === 'fine' ? 'fine' : 'disliked';
    const { min, max } = TIER_BOUNDARIES[tier];
    const n = books.length;

    // Calculate new scores: range*(n)/n + min, range*(n-1)/n + min, ..., range*1/n + min
    const range = max - min;
    const updatedBooks = books.map((book, index) => ({
      id: book.id,
      score: roundScore(range * (n - index) / n + min),
    }));

    // Use updateTierScoresBatch with touchUpdatedAt: false to avoid updating timestamps
    await updateTierScoresBatch(userId, tier, updatedBooks, {
      touchUpdatedAt: false,
    });

    return { error: null };
  } catch (error) {
    console.error('Error redistributing ranks:', error);
    return { error };
  }
}

/**
 * Get book counts by status for a user
 */
export async function getUserBookCounts(
  userId: string
): Promise<{
  read: number;
  currently_reading: number;
  want_to_read: number;
}> {
  try {
    const { data, error } = await supabase
      .from('user_books')
      .select('status')
      .eq('user_id', userId);

    if (error) throw error;

    const counts = {
      read: 0,
      currently_reading: 0,
      want_to_read: 0,
    };

    (data || []).forEach((item) => {
      if (item.status === 'read') counts.read++;
      else if (item.status === 'currently_reading') counts.currently_reading++;
      else if (item.status === 'want_to_read') counts.want_to_read++;
    });

    return counts;
  } catch (error) {
    console.error('Error fetching user book counts:', error);
    throw error;
  }
}

/**
 * Get user's books filtered by rating, ordered by rank_score (highest first)
 */
export async function getUserBooksByRating(
  userId: string,
  rating: 'liked' | 'fine' | 'disliked'
): Promise<UserBook[]> {
  try {
    const { data, error } = await supabase
      .from('user_books')
      .select(
        `
        *,
        book:books(*)
      `
      )
      .eq('user_id', userId)
      .eq('rating', rating)
      .order('rank_score', { ascending: false, nullsFirst: false });

    if (error) throw error;

    return (data || []).map((item) => ({
      ...item,
      book: item.book as Book,
    })) as UserBook[];
  } catch (error) {
    console.error('Error fetching user books by rating:', error);
    throw error;
  }
}

/**
 * Get recent user books (for activity feed)
 * Ordered by updated_at to show most recent activity
 * Filters out pure rank_score updates - only shows meaningful changes (status, rating, notes)
 *
 * Note: Since we don't update updated_at when setting rank_score, rank_score changes
 * won't appear in recent activity automatically. This is intentional.
 */
export async function getRecentUserBooks(
  userId: string,
  limit: number = 10
): Promise<UserBook[]> {
  try {
    const { data, error } = await supabase
      .from('user_books')
      .select(
        `
        *,
        book:books(*)
      `
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit * 2); // Fetch more to account for filtering

    if (error) {
      console.error('=== getRecentUserBooks: Database error ===', error);
      throw error;
    }

    // Filter to only show meaningful updates (status, rating, notes changes)
    // Rank_score updates don't change updated_at, so they won't appear here
    // This is intentional - we only want to show user-initiated changes
    const result = (data || [])
      .map((item) => ({
        ...item,
        book: item.book as Book,
      }))
      .slice(0, limit) as UserBook[]; // Take first N after filtering


    return result;
  } catch (error) {
    console.error('Error fetching recent user books:', error);
    throw error;
  }
}

/**
 * Get all read sessions for a user_book
 */
export async function getReadSessions(
  userBookId: string
): Promise<ReadSession[]> {
  try {
    const { data, error } = await supabase
      .from('user_book_read_sessions')
      .select('*')
      .eq('user_book_id', userBookId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []) as ReadSession[];
  } catch (error) {
    console.error('Error fetching read sessions:', error);
    throw error;
  }
}

/**
 * Add a new read session
 * Validates that at least one date is provided and finished_date >= started_date
 */
export async function addReadSession(
  userBookId: string,
  dates: {
    started_date?: string | null;
    finished_date?: string | null;
  }
): Promise<{ data: ReadSession | null; error: any }> {
  try {
    // Validate at least one date is provided
    if (!dates.started_date && !dates.finished_date) {
      return {
        data: null,
        error: { message: 'At least one date (started or finished) must be provided' }
      };
    }

    // Validate finished_date >= started_date if both provided
    if (dates.started_date && dates.finished_date) {
      if (new Date(dates.finished_date) < new Date(dates.started_date)) {
        return {
          data: null,
          error: { message: 'Finished date cannot be before started date' }
        };
      }
    }

    // Insert session
    const { data, error } = await supabase
      .from('user_book_read_sessions')
      .insert({
        user_book_id: userBookId,
        started_date: dates.started_date,
        finished_date: dates.finished_date,
      })
      .select()
      .single();

    // Note: We do NOT update user_books.updated_at here
    // Only shelf status changes should update the timestamp

    return { data: data as ReadSession | null, error };
  } catch (error) {
    console.error('Error adding read session:', error);
    return { data: null, error };
  }
}

/**
 * Update an existing read session
 * Validates that at least one date is provided and finished_date >= started_date
 */
export async function updateReadSession(
  sessionId: string,
  dates: {
    started_date?: string | null;
    finished_date?: string | null;
  }
): Promise<{ data: ReadSession | null; error: any }> {
  try {
    // Get the user_book_id first to update updated_at later
    const { data: session } = await supabase
      .from('user_book_read_sessions')
      .select('user_book_id')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return {
        data: null,
        error: { message: 'Read session not found' }
      };
    }

    // Validate at least one date is provided
    if (dates.started_date === null && dates.finished_date === null) {
      return {
        data: null,
        error: { message: 'At least one date (started or finished) must be provided' }
      };
    }

    // Validate finished_date >= started_date if both provided
    if (dates.started_date && dates.finished_date) {
      if (new Date(dates.finished_date) < new Date(dates.started_date)) {
        return {
          data: null,
          error: { message: 'Finished date cannot be before started date' }
        };
      }
    }

    // Update session
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (dates.started_date !== undefined) {
      updateData.started_date = dates.started_date;
    }
    if (dates.finished_date !== undefined) {
      updateData.finished_date = dates.finished_date;
    }

    const { data, error } = await supabase
      .from('user_book_read_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    // Note: We do NOT update user_books.updated_at here
    // Only shelf status changes should update the timestamp

    return { data: data as ReadSession | null, error };
  } catch (error) {
    console.error('Error updating read session:', error);
    return { data: null, error };
  }
}

/**
 * Delete a read session
 */
export async function deleteReadSession(
  sessionId: string
): Promise<{ error: any }> {
  try {
    // Get the user_book_id first to update updated_at later
    const { data: session } = await supabase
      .from('user_book_read_sessions')
      .select('user_book_id')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return { error: { message: 'Read session not found' } };
    }

    // Delete session
    const { error } = await supabase
      .from('user_book_read_sessions')
      .delete()
      .eq('id', sessionId);

    // Note: We do NOT update user_books.updated_at here
    // Only shelf status changes should update the timestamp

    return { error };
  } catch (error) {
    console.error('Error deleting read session:', error);
    return { error };
  }
}

/**
 * Remove a custom label from all books for a user
 * Uses PostgreSQL function for atomic batch update
 * Returns the count of affected books
 */
export async function removeCustomLabelFromAllBooks(
  userId: string,
  labelToRemove: string
): Promise<number> {
  const { data, error } = await supabase.rpc('remove_custom_label', {
    p_user_id: userId,
    p_label: labelToRemove,
  });

  if (error) {
    console.error('Error removing custom label from all books:', error);
    throw error;
  }

  return data || 0;
}
