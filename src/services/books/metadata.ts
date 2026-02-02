import { supabase } from '../../config/supabase';

/**
 * @deprecated Use updateUserBookDetails with user_genres instead.
 * This function updates the global books.genres which affects all users.
 * For per-user genre customization, save to user_books.user_genres via updateUserBookDetails.
 *
 * Update book genres (mapped preset genres)
 * Uses Edge Function to bypass RLS on books table
 */
export async function updateBookGenres(
  bookId: string,
  genres: string[]
): Promise<{ error: any }> {
  try {

    const { data, error } = await supabase.functions.invoke('books-update-genres', {
      body: { book_id: bookId, genres },
    });

    if (error) {
      console.error('=== updateBookGenres: Edge Function error ===', error);
      return { error };
    }

    if (!data?.success) {
      const errMsg = data?.error || 'Unknown error from Edge Function';
      console.error('=== updateBookGenres: Edge Function failed ===', errMsg);
      return { error: new Error(errMsg) };
    }

    return { error: null };
  } catch (error) {
    console.error('Error updating book genres:', error);
    return { error };
  }
}
