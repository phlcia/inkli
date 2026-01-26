import { supabase } from '../config/supabase';
import { Book } from './books';

export async function enrichBook(
  bookId: string,
  openlibraryId: string
): Promise<{ data: Book | null; error: Error | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return {
        data: null,
        error: new Error('Not authenticated'),
      };
    }

    const { data, error } = await supabase.functions.invoke('books-enrich', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: { bookId, openlibraryId },
    });

    if (error || data?.error) {
      console.error('Error enriching book:', error || data?.error);
      return {
        data: null,
        error: new Error(error?.message || data?.error || 'Failed to enrich book'),
      };
    }

    return { data: data?.book || null, error: null };
  } catch (error) {
    console.error('Exception enriching book:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}
