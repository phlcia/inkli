import { supabase } from '../../config/supabase';
import type { Book } from './types';

export async function upsertBookViaEdge(
  enrichedBook: any
): Promise<{ book: Book; book_id: string }> {
  const { data, error } = await supabase.functions.invoke('books-upsert', {
    body: { book: enrichedBook },
  });

  if (error) {
    console.error('Error upserting book via Edge Function:', error);
    throw error;
  }

  if (!data?.book_id || !data?.book) {
    throw new Error('Invalid response from books-upsert');
  }

  return { book_id: data.book_id as string, book: data.book as Book };
}
