import { supabase } from '../config/supabase';

export type CoverResolvableBook = {
  isbn_13?: string | null;
  isbn?: string | null;
  open_library_id?: string | null;
  google_books_id?: string | null;
  cover_id?: number | null;
  cover_i?: number | null;
  _raw?: { cover_i?: number | null } | null;
};

const MAX_CACHE_ENTRIES = 1000;
const coverCache = new Map<string, string | null>();
const pendingResolutions = new Map<string, Promise<string | null>>();

const getCacheKey = (book: CoverResolvableBook): string | null => {
  return (
    book.isbn_13 ||
    book.open_library_id ||
    book.google_books_id ||
    book.isbn ||
    null
  );
};

const getFromCache = (key: string): string | null | undefined => {
  if (!coverCache.has(key)) return undefined;
  const value = coverCache.get(key);
  coverCache.delete(key);
  coverCache.set(key, value ?? null);
  return value;
};

const setCache = (key: string, value: string | null) => {
  if (coverCache.has(key)) {
    coverCache.delete(key);
  }
  coverCache.set(key, value);
  if (coverCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = coverCache.keys().next().value;
    if (oldestKey) {
      coverCache.delete(oldestKey);
    }
  }
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

export const verifyImageUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(url, { method: 'HEAD' }, 2000);
    if (!response.ok) return false;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return false;

    const contentLength = response.headers.get('content-length');
    if (!contentLength) return false;
    if (Number(contentLength) <= 1000) return false;

    return true;
  } catch (_error) {
    return false;
  }
};

const fetchCoverFromDb = async (book: CoverResolvableBook): Promise<string | null> => {
  if (book.isbn_13) {
    const { data, error } = await supabase
      .from('books')
      .select('cover_url')
      .eq('isbn_13', book.isbn_13)
      .not('cover_url', 'is', null)
      .maybeSingle();

    if (!error && data?.cover_url) {
      return data.cover_url;
    }
  }

  if (book.open_library_id) {
    const { data, error } = await supabase
      .from('books')
      .select('cover_url')
      .eq('open_library_id', book.open_library_id)
      .not('cover_url', 'is', null)
      .maybeSingle();

    if (!error && data?.cover_url) {
      return data.cover_url;
    }
  }

  if (book.google_books_id) {
    const { data, error } = await supabase
      .from('books')
      .select('cover_url')
      .eq('google_books_id', book.google_books_id)
      .not('cover_url', 'is', null)
      .maybeSingle();

    if (!error && data?.cover_url) {
      return data.cover_url;
    }
  }

  return null;
};

export const cacheToDatabase = async (
  book: CoverResolvableBook,
  coverUrl: string | null
) => {
  if (!coverUrl || !book.isbn_13) return;

  try {
    await supabase
      .from('books')
      .upsert(
        {
          isbn_13: book.isbn_13,
          cover_url: coverUrl,
          cover_fetched_at: new Date().toISOString(),
        },
        { onConflict: 'isbn_13' }
      );
  } catch (_error) {
    // Ignore cache failures to avoid breaking search flows.
  }
};

const getOpenLibraryCoverId = (book: CoverResolvableBook): number | null => {
  if (typeof book.cover_id === 'number') return book.cover_id;
  if (typeof book.cover_i === 'number') return book.cover_i;
  if (typeof book._raw?.cover_i === 'number') return book._raw.cover_i;
  return null;
};

export const resolveCoverUrl = async (
  book: CoverResolvableBook
): Promise<string | null> => {
  const cacheKey = getCacheKey(book);
  if (!cacheKey) return null;

  const cached = getFromCache(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const pending = pendingResolutions.get(cacheKey);
  if (pending) {
    return pending;
  }

  const resolver = (async () => {
    const dbCover = await fetchCoverFromDb(book);
    if (dbCover) {
      setCache(cacheKey, dbCover);
      return dbCover;
    }

    if (book.google_books_id) {
      const googleUrl = `https://books.google.com/books/content?id=${encodeURIComponent(
        book.google_books_id
      )}&printsec=frontcover&img=1&zoom=1`;
      if (await verifyImageUrl(googleUrl)) {
        setCache(cacheKey, googleUrl);
        await cacheToDatabase(book, googleUrl);
        return googleUrl;
      }
    }

    const openLibraryCoverId = getOpenLibraryCoverId(book);
    if (openLibraryCoverId) {
      const openLibraryIdUrl = `https://covers.openlibrary.org/b/id/${openLibraryCoverId}-L.jpg`;
      setCache(cacheKey, openLibraryIdUrl);
      await cacheToDatabase(book, openLibraryIdUrl);
      return openLibraryIdUrl;
    }

    const isbnForCover = book.isbn_13 || book.isbn;
    if (isbnForCover) {
      const openLibraryIsbnUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(
        isbnForCover
      )}-L.jpg`;
      if (await verifyImageUrl(openLibraryIsbnUrl)) {
        setCache(cacheKey, openLibraryIsbnUrl);
        await cacheToDatabase(book, openLibraryIsbnUrl);
        return openLibraryIsbnUrl;
      }
    }

    setCache(cacheKey, null);
    return null;
  })();

  pendingResolutions.set(cacheKey, resolver);
  try {
    return await resolver;
  } finally {
    pendingResolutions.delete(cacheKey);
  }
};
