import { supabase } from '../../config/supabase';
import type { Book } from './types';
import { lookupOpenLibraryIdByTitleAuthor } from './openLibraryLookup';

function hasValidOpenLibraryId(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith('/works/');
}

export async function upsertBookViaEdge(
  enrichedBook: any
): Promise<{ book: Book; book_id: string }> {
  let bookToSend = enrichedBook;
  if (!hasValidOpenLibraryId(enrichedBook?.open_library_id)) {
    const title = enrichedBook?.title;
    const author = enrichedBook?.authors?.[0];
    if (typeof title === 'string' && title.trim()) {
      const olId = await lookupOpenLibraryIdByTitleAuthor(title, author);
      if (olId) {
        bookToSend = { ...enrichedBook, open_library_id: olId };
      }
    }
  }

  const payload = {
    title: bookToSend?.title,
    open_library_id: bookToSend?.open_library_id,
    google_books_id: bookToSend?.google_books_id,
    isbn_13: bookToSend?.isbn_13,
  };
  console.log('[upsertBookViaEdge] Sending payload:', payload);

  const { data, error } = await supabase.functions.invoke('books-upsert', {
    body: { book: bookToSend },
  });

  if (error) {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.text === 'function' && !ctx.bodyUsed) {
      try {
        const bodyText = await ctx.text();
        console.error('[upsertBookViaEdge] Edge 400 response body:', bodyText);
      } catch (_) {
        console.error('[upsertBookViaEdge] Could not read error body');
      }
    } else if (ctx && typeof JSON.stringify === 'function') {
      console.error('[upsertBookViaEdge] error.context:', JSON.stringify(ctx, null, 2));
    }
    console.error('[upsertBookViaEdge] Edge error:', {
      message: error.message,
      name: error.name,
      context: (error as any)?.context,
      full: error,
    });
    throw error;
  }

  if (!data?.book_id || !data?.book) {
    console.error('[upsertBookViaEdge] Invalid response:', { data });
    throw new Error('Invalid response from books-upsert');
  }

  return { book_id: data.book_id as string, book: data.book as Book };
}
