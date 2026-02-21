export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1000000) return `${Math.floor(count / 1000)}k`;
  return `${Math.floor(count / 1000000)}M`;
}

const OPEN_LIBRARY_WORKS_PREFIX = '/works/';

/**
 * Normalize open_library_id for books-upsert edge: must start with "/works/".
 * Accepts full key ("/works/OL45804W") or short form ("OL45804W").
 */
function normalizeOpenLibraryId(value: unknown): string | null {
  if (value == null || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  if (s.startsWith(OPEN_LIBRARY_WORKS_PREFIX)) return s;
  return OPEN_LIBRARY_WORKS_PREFIX + s;
}

/**
 * Check if we have at least one valid identifier for the edge.
 */
function hasValidIdentifier(openLibraryId: string | null, googleBooksId: string | null, isbn13: unknown): boolean {
  if (openLibraryId != null && openLibraryId.startsWith(OPEN_LIBRARY_WORKS_PREFIX)) return true;
  if (googleBooksId != null && googleBooksId.length > 0 && !/\s/.test(googleBooksId)) return true;
  if (typeof isbn13 === 'string' && isbn13.replace(/\D/g, '').length === 13) return true;
  return false;
}

export interface NormalizeBookForEdgeResult {
  book: Record<string, unknown>;
  valid: boolean;
  error?: string;
}

/**
 * Normalize and validate a book for the books-upsert edge.
 * - Title: coerced to non-empty string (fallback "Unknown Title").
 * - open_library_id: normalized to start with "/works/" if present.
 * - google_books_id: preserved (not dropped).
 * - Ensures at least one of open_library_id, google_books_id, or isbn_13 is valid.
 */
export function normalizeBookForEdge(book: any): NormalizeBookForEdgeResult {
  const title = typeof book?.title === 'string' ? book.title.trim() : String(book?.title ?? '').trim();
  const finalTitle = title || 'Unknown Title';

  const rawOl = book?.open_library_id;
  const open_library_id = normalizeOpenLibraryId(rawOl) || null;

  const rawGb = book?.google_books_id;
  const google_books_id =
    rawGb != null && typeof rawGb === 'string' && rawGb.trim() && !/\s/.test(rawGb.trim())
      ? rawGb.trim()
      : null;

  const rawIsbn = book?.isbn_13;
  const isbn_13 =
    typeof rawIsbn === 'string' && rawIsbn.replace(/\D/g, '').length === 13 ? rawIsbn.replace(/\D/g, '') : null;

  const valid = hasValidIdentifier(open_library_id, google_books_id, isbn_13);

  const normalized = {
    ...book,
    title: finalTitle,
    open_library_id,
    google_books_id,
    isbn_13: isbn_13 ?? book?.isbn_13 ?? null,
  };

  let error: string | undefined;
  if (!valid) {
    error =
      'Missing unique identifier (need at least one of: open_library_id with /works/ prefix, google_books_id, or isbn_13)';
  }

  return { book: normalized, valid, error };
}

/**
 * Format rank score for display (rounds to one decimal place)
 * Helper function to format score for display
 */
export function formatRankScore(score: number | null): string {
  if (score === null || score === undefined) return '--';
  return score.toFixed(1); // Always show one decimal place
}
