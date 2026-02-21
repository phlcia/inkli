import { supabase } from '../../config/supabase';
import type { Book } from './types';
import { lookupOpenLibraryIdByTitleAuthor } from './openLibraryLookup';
import { upsertBookViaEdge } from './upsert';

const GOOGLE_BOOKS_API_BASE = 'https://www.googleapis.com/books/v1/volumes';

// ============================================================================
// In-Memory Cache for Google Books API
// ============================================================================

// Cache Google Books lookups in memory to avoid repeat API calls
const gbCache = new Map<string, any>();

/**
 * Get cache key for a book
 */
function getCacheKey(book: any): string {
  return book.open_library_id || book.isbn || `${book.title}-${book.authors?.[0] || ''}`;
}

/**
 * Clear the Google Books cache (useful for testing or memory management)
 */
export function clearGoogleBooksCache(): void {
  gbCache.clear();
}

// ============================================================================
// Helper Functions for Book Matching and Merging
// ============================================================================

/**
 * String similarity for matching books between Open Library and Google Books
 * Enhanced with fuzzy matching tolerance
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

/**
 * Calculate relevance score for search results
 * Higher score = more relevant to the query
 */
function calculateRelevanceScore(book: any, query: string): number {
  const normalizedQuery = query.toLowerCase().trim();
  let score = 0;

  const bookTitle = (book.title || '').toLowerCase();
  const bookAuthors = book.author_name || [];
  const bookISBNs = book.isbn || [];

  // 1. Title similarity (most important - weight: 100)
  const titleSim = similarity(normalizedQuery, bookTitle);
  score += titleSim * 100;

  // 2. Prefix match bonus (search query matches start of title - weight: 30)
  if (bookTitle.startsWith(normalizedQuery)) {
    score += 30;
  }

  // 3. Exact title match (case-insensitive - weight: 50)
  if (bookTitle === normalizedQuery) {
    score += 50;
  }

  // 4. Title contains query as whole word (weight: 20)
  const titleWords = bookTitle.split(/\s+/);
  if (titleWords.some(word => word === normalizedQuery)) {
    score += 20;
  }

  // 5. Author match (weight: 50 for good match)
  const authorMatch = bookAuthors.some((author: string) => {
    const authorLower = author.toLowerCase();
    const authorSim = similarity(normalizedQuery, authorLower);

    // Check if query matches author's last name
    const authorParts = authorLower.split(/\s+/);
    const lastName = authorParts[authorParts.length - 1];

    return authorSim > 0.7 ||
           authorLower.includes(normalizedQuery) ||
           (lastName && lastName.startsWith(normalizedQuery));
  });
  if (authorMatch) score += 50;

  // 6. ISBN exact match (perfect indicator - weight: 200)
  if (bookISBNs.some((isbn: string) => isbn === query.replace(/[-\s]/g, ''))) {
    score += 200;
  }

  // 7. Has cover image (quality signal - weight: 5)
  if (book.cover_i) score += 5;

  // 8. Publication recency (slight boost for newer books - weight: 0-10)
  if (book.first_publish_year) {
    const currentYear = new Date().getFullYear();
    const bookAge = currentYear - book.first_publish_year;
    if (bookAge < 5) score += 10;
    else if (bookAge < 20) score += 5;
  }

  // 9. Fuzzy author last name match (catches typos in author search)
  bookAuthors.forEach((author: string) => {
    const authorParts = author.toLowerCase().split(/\s+/);
    const lastName = authorParts[authorParts.length - 1];
    if (lastName && similarity(normalizedQuery, lastName) > 0.75) {
      score += 25;
    }
  });

  return score;
}

/**
 * Find best Google Books match for an Open Library book
 * Enhanced with better fuzzy matching
 */
function findBestMatch(olBook: any, gbItems: any[] = []): any | null {
  if (!gbItems || gbItems.length === 0) return null;

  const scored = gbItems.map(item => {
    const book = item.volumeInfo;
    let score = 0;

    // Title similarity (very important)
    const titleMatch = similarity(
      olBook.title.toLowerCase(),
      book.title?.toLowerCase() || ''
    );
    score += titleMatch * 10;

    // Fuzzy title match with higher threshold
    if (titleMatch > 0.85) score += 5;

    // Author match with fuzzy matching
    const olAuthor = olBook.author_name?.[0]?.toLowerCase() || '';
    const gbAuthor = book.authors?.[0]?.toLowerCase() || '';
    if (olAuthor && gbAuthor) {
      const authorSim = similarity(olAuthor, gbAuthor);
      if (authorSim > 0.7) {
        score += 5 * authorSim;
      }

      // Last name matching
      const olLastName = olAuthor.split(' ').pop() || '';
      const gbLastName = gbAuthor.split(' ').pop() || '';
      if (olLastName && gbLastName &&
          (olLastName.includes(gbLastName) || gbLastName.includes(olLastName) ||
           similarity(olLastName, gbLastName) > 0.8)) {
        score += 5;
      }
    }

    // ISBN match (perfect match)
    if (olBook.isbn?.some((isbn: string) =>
      book.industryIdentifiers?.some((id: any) => id.identifier === isbn)
    )) {
      score += 20;
    }

    // Has description
    if (book.description && book.description.length > 100) score += 2;

    // Has cover
    if (book.imageLinks?.thumbnail) score += 1;

    return { item, score };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best && best.score > 5 ? best.item : null;
}

/**
 * Merge categories from both sources
 */
function mergeCategories(olSubjects: string[] = [], gbCategories: string[] = []): string[] {
  const combined = new Set<string>();

  gbCategories.forEach(cat => combined.add(cat));

  olSubjects.slice(0, 5).forEach(subject => {
    const cleaned = subject
      .replace(/^(Fiction|Nonfiction) \//, '')
      .replace(/\s*\(.*?\)\s*/, '')
      .trim();
    if (cleaned && cleaned.length < 50) {
      combined.add(cleaned);
    }
  });

  return Array.from(combined);
}

/**
 * Get best cover URL from Google Books or Open Library
 * Preserves existing cover_url if available, otherwise tries to get from Google Books or build from Open Library
 */
function getCoverUrl(gbBook: any, olBook: any, existingCoverUrl?: string | null): string | null {
  // If we already have a cover URL, preserve it
  if (existingCoverUrl) return existingCoverUrl;

  // Try Google Books cover first (higher quality)
  const gbCover = gbBook?.imageLinks?.extraLarge
    || gbBook?.imageLinks?.large
    || gbBook?.imageLinks?.medium
    || gbBook?.imageLinks?.thumbnail?.replace('zoom=1', 'zoom=2');

  if (gbCover) return gbCover;

  // Fallback to Open Library cover
  if (olBook.cover_i) {
    return `https://covers.openlibrary.org/b/id/${olBook.cover_i}-L.jpg`;
  }

  // If olBook has cover_url already set, use it
  if (olBook.cover_url) {
    return olBook.cover_url;
  }

  return null;
}

/**
 * Resolve published date from both sources
 */
function resolvePublishedDate(olBook: any, gbBook: any): string | null {
  const gbDate = gbBook?.publishedDate;

  // Prefer Google Books full date (YYYY-MM-DD)
  if (gbDate && gbDate.includes('-')) {
    return gbDate;
  }

  // Or Google Books year
  if (gbDate && gbDate.length === 4) {
    return gbDate;
  }

  // Fallback to Open Library year
  return olBook.first_publish_year ? olBook.first_publish_year.toString() : null;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search books using Open Library API (returns deduplicated results)
 * Enhanced with relevance scoring and better fuzzy matching
 */
export async function searchBooks(query: string): Promise<any[]> {
  try {
    const normalizedQuery = query.trim();

    // Use Open Library for search (deduplicated results)
    // Fetch more results to have better selection after scoring
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(normalizedQuery)}&limit=60`
    );

    if (!response.ok) {
      throw new Error('Open Library search failed');
    }

    const data = await response.json();

    const books = data.docs.map((book: any) => {
      // Calculate relevance score for each result
      const relevanceScore = calculateRelevanceScore(book, normalizedQuery);

      return {
        open_library_id: book.key, // e.g., "/works/OL45804W"
        title: book.title,
        authors: book.author_name || [],
        cover_url: book.cover_i
          ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
          : null,
        first_publish_year: book.first_publish_year,
        isbn: book.isbn?.[0],
        relevanceScore, // Add relevance score
        _raw: book // Keep raw data for enrichment
      };
    });

    const normalizedLower = normalizedQuery.toLowerCase();
    const exactTitleMatches = books.filter(
      (book) => (book.title || '').toLowerCase() === normalizedLower
    );
    const nonExactMatches = books.filter(
      (book) => (book.title || '').toLowerCase() !== normalizedLower
    );

    // Sort by relevance score (highest first) and return top 20
    const sortedBooks = [
      ...exactTitleMatches,
      ...nonExactMatches.sort((a, b) => b.relevanceScore - a.relevanceScore),
    ].slice(0, 20);

    return sortedBooks;

  } catch (error) {
    console.error('Open Library search error:', error);
    return [];
  }
}

/**
 * Search books with stats (average score and member count)
 * Uses pre-calculated community statistics from the books table (updated via triggers)
 * Enhanced with relevance scoring
 */
export async function searchBooksWithStats(query: string): Promise<any[]> {
  try {
    // First, search Open Library (now returns relevance-sorted results)
    const books = await searchBooks(query);

    // For each book, check if it exists in database and get pre-calculated stats
    const booksWithStats = await Promise.all(
      books.map(async (book) => {
        // Check if book exists in database
        const existingBook = await checkDatabaseForBook(book.open_library_id, null);

        if (!existingBook) {
          // Book not in database, return without stats
          return {
            ...book,
            average_score: null,
            member_count: 0,
            categories: null,
          };
        }

        // Use pre-calculated community stats from books table
        // These are automatically updated by database triggers
        const average_score = existingBook.community_average_score ?? null;
        const member_count = existingBook.community_rank_count ?? 0;

        return {
          ...book,
          ...existingBook,
          // Map community stats to backward-compatible field names
          average_score,
          member_count,
          categories: existingBook.categories || [],
        };
      })
    );

    const isbn13s = Array.from(
      new Set(
        booksWithStats
          .map((book) => book.isbn_13 || book.isbn || null)
          .filter((value: string | null): value is string => Boolean(value))
      )
    );
    const openLibraryIds = Array.from(
      new Set(
        booksWithStats
          .map((book) => book.open_library_id || null)
          .filter((value: string | null): value is string => Boolean(value))
      )
    );
    const googleBooksIds = Array.from(
      new Set(
        booksWithStats
          .map((book) => book.google_books_id || null)
          .filter((value: string | null): value is string => Boolean(value))
      )
    );

    const orFilters: string[] = [];
    const formatInList = (values: string[]) =>
      values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(',');

    if (isbn13s.length > 0) {
      orFilters.push(`isbn_13.in.(${formatInList(isbn13s)})`);
    }
    if (openLibraryIds.length > 0) {
      orFilters.push(`open_library_id.in.(${formatInList(openLibraryIds)})`);
    }
    if (googleBooksIds.length > 0) {
      orFilters.push(`google_books_id.in.(${formatInList(googleBooksIds)})`);
    }

    if (orFilters.length > 0) {
      const { data, error } = await supabase
        .from('books')
        .select('isbn_13, open_library_id, google_books_id, cover_url')
        .not('cover_url', 'is', null)
        .or(orFilters.join(','));

      if (!error && data) {
        const coverMapByIsbn = new Map<string, string>();
        const coverMapByOl = new Map<string, string>();
        const coverMapByGb = new Map<string, string>();

        data.forEach((row) => {
          if (row.cover_url) {
            if (row.isbn_13) coverMapByIsbn.set(row.isbn_13, row.cover_url);
            if (row.open_library_id) coverMapByOl.set(row.open_library_id, row.cover_url);
            if (row.google_books_id) coverMapByGb.set(row.google_books_id, row.cover_url);
          }
        });

        booksWithStats.forEach((book) => {
          if (book.cover_url) return;
          const isbn = book.isbn_13 || book.isbn || null;
          const olId = book.open_library_id || null;
          const gbId = book.google_books_id || null;

          book.cover_url =
            (isbn && coverMapByIsbn.get(isbn)) ||
            (olId && coverMapByOl.get(olId)) ||
            (gbId && coverMapByGb.get(gbId)) ||
            null;
        });
      }
    }

    return booksWithStats;
  } catch (error) {
    console.error('Error searching books with stats:', error);
    return [];
  }
}

// ============================================================================
// Ask enrichment: validation and Google Books–first pipeline
// ============================================================================

const TITLE_REJECT_WORDS = [
  'summary', 'guide', 'analysis', 'study guide', 'workbook', 'companion',
  'review', 'overview', 'cliff', 'cliffnotes', 'sparknotes', 'insight',
];

function getLastName(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1].toLowerCase() : '';
}

function titleRejected(title: string): boolean {
  const t = (title || '').toLowerCase();
  return TITLE_REJECT_WORDS.some((word) => t.includes(word));
}

function authorLastNameFuzzyMatch(expectedAuthor: string, actualAuthors: string[]): boolean {
  const expectedLast = getLastName(expectedAuthor);
  if (!expectedLast) return true;
  for (const a of actualAuthors || []) {
    const actualLast = getLastName(a);
    if (!actualLast) continue;
    const dist = levenshteinDistance(expectedLast, actualLast);
    if (dist <= 4) return true;
  }
  return false;
}

function parseYearFromPublishedDate(publishedDate: string | undefined): number | null {
  if (!publishedDate || typeof publishedDate !== 'string') return null;
  const yearMatch = publishedDate.match(/\d{4}/);
  return yearMatch ? parseInt(yearMatch[0], 10) : null;
}

/**
 * Search Google Books by title + author (and optional year). Returns raw API items.
 */
export async function searchGoogleBooks(
  title: string,
  author: string,
  year?: number
): Promise<any[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
  const q = [title, author].filter(Boolean).join(' ');
  const queryParams = new URLSearchParams({
    q: q.trim(),
    maxResults: '15',
  });
  if (apiKey) queryParams.append('key', apiKey);
  const url = `${GOOGLE_BOOKS_API_BASE}?${queryParams.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  if (!data?.items || !Array.isArray(data.items)) return [];
  return data.items;
}

function validateAndScoreGbItem(
  item: any,
  expectedAuthor: string,
  expectedYear?: number
): { valid: boolean; score: number } {
  const vi = item?.volumeInfo || {};
  const title = (vi.title || '').trim();
  const authors: string[] = Array.isArray(vi.authors) ? vi.authors : [];
  const pageCount = typeof vi.pageCount === 'number' ? vi.pageCount : 0;
  const printType = (vi.printType || '').toLowerCase();
  const publishedYear = parseYearFromPublishedDate(vi.publishedDate);

  if (titleRejected(title)) return { valid: false, score: 0 };
  if (pageCount > 0 && pageCount < 150) return { valid: false, score: 0 };
  if (!authorLastNameFuzzyMatch(expectedAuthor, authors)) return { valid: false, score: 0 };

  let score = 10;
  if (expectedYear != null && publishedYear != null) {
    const diff = Math.abs(publishedYear - expectedYear);
    if (diff <= 2) score += 20;
    else if (diff <= 5) score += 10;
  }
  if (printType === 'books') score += 15;
  return { valid: true, score };
}

function getCoverFromGbItem(item: any): string | null {
  const vi = item?.volumeInfo || {};
  const links = vi.imageLinks || {};
  return (
    links.extraLarge ||
    links.large ||
    links.medium ||
    (links.thumbnail ? links.thumbnail.replace('zoom=1', 'zoom=2') : null) ||
    null
  );
}

/**
 * Validates a Google Books–enriched book for use in SearchScreen tap handler.
 * Rejects summary/companion titles, low page count, and author mismatch.
 * Does NOT apply year ±2 (we already have the correct book from Open Library).
 * Returns true if enrichment is safe to save/use; false to use OL data only.
 */
export function validateEnrichmentForSearch(
  enrichedBook: any,
  originalOlBook: any
): boolean {
  if (!enrichedBook) return false;
  const title = (enrichedBook.title || '').trim();
  if (titleRejected(title)) return false;
  const pageCount = enrichedBook.page_count;
  if (typeof pageCount === 'number' && pageCount < 150) return false;
  const olAuthors: string[] = Array.isArray(originalOlBook?.authors)
    ? originalOlBook.authors
    : [];
  const enrichedAuthors: string[] = Array.isArray(enrichedBook.authors) ? enrichedBook.authors : [];
  const atLeastOneAuthorMatches = olAuthors.some((olAuthor: string) =>
    authorLastNameFuzzyMatch(olAuthor, enrichedAuthors)
  );
  if (!atLeastOneAuthorMatches && olAuthors.length > 0) return false;
  return true;
}

export interface EnrichForAskResult {
  cover: string | null;
  pageCount: number | null;
  publisher: string | null;
  publishedYear: number | null;
  googleBooksId: string | null;
  open_library_id?: string | null;
}

/**
 * Enrich a suggestion (title, author, optional year): try Google Books first, then Open Library.
 * Returns validated enrichment; if both fail validation, returns { cover: null, pageCount: null, publisher: null, ... }.
 */
export async function enrichForAsk(suggestion: {
  title: string;
  author: string;
  year?: number;
}): Promise<EnrichForAskResult> {
  const { title, author, year } = suggestion;

  // 1. Try Google Books first
  const gbItems = await searchGoogleBooks(title, author, year);
  const scored = gbItems
    .map((item) => ({
      item,
      ...validateAndScoreGbItem(item, author, year),
    }))
    .filter((x) => x.valid)
    .sort((a, b) => b.score - a.score);
  const bestGb = scored[0];
  if (bestGb?.item) {
    const vi = bestGb.item.volumeInfo || {};
    const openLibraryId = await lookupOpenLibraryIdByTitleAuthor(title, author);
    return {
      cover: getCoverFromGbItem(bestGb.item),
      pageCount: typeof vi.pageCount === 'number' ? vi.pageCount : null,
      publisher: vi.publisher || null,
      publishedYear: parseYearFromPublishedDate(vi.publishedDate),
      googleBooksId: bestGb.item.id || null,
      open_library_id: openLibraryId ?? null,
    };
  }

  // 2. Fallback: Open Library search, then enrich with Google Books and validate
  const query = [title, author].filter(Boolean).join(' ').trim();
  const olResults = await searchBooks(query);
  for (const olBook of olResults) {
    if (titleRejected(olBook.title || '')) continue;
    const enriched = await enrichBookWithGoogleBooks(olBook);
    const gbId = enriched?.google_books_id;
    const pageCount = enriched?.page_count;
    const authors = enriched?.authors || [];
    if (typeof pageCount === 'number' && pageCount < 150) continue;
    if (!authorLastNameFuzzyMatch(author, authors)) continue;
    const publishedYear = enriched?.first_published ?? parseYearFromPublishedDate(enriched?.published_date ?? undefined);
    return {
      cover: enriched?.cover_url ?? null,
      pageCount: pageCount ?? null,
      publisher: enriched?.publisher ?? null,
      publishedYear: publishedYear ?? null,
      googleBooksId: gbId || null,
      open_library_id: enriched?.open_library_id ?? null,
    };
  }

  // No valid match: return fallback object per spec (cover/pageCount/publisher null)
  return {
    cover: null,
    pageCount: null,
    publisher: null,
    publishedYear: null,
    googleBooksId: null,
  };
}

// ============================================================================
// Book Enrichment Functions
// ============================================================================

/**
 * Check if book already exists in database
 * Returns the existing book if found, null otherwise
 */
export async function checkDatabaseForBook(
  openLibraryId?: string | null,
  googleBooksId?: string | null
): Promise<Book | null> {
  try {
    if (openLibraryId) {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('open_library_id', openLibraryId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking database for book:', error);
        return null;
      }

      if (data) {
        return data as Book;
      }
    }

    if (googleBooksId) {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('google_books_id', googleBooksId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking database for book:', error);
        return null;
      }

      if (data) {
        return data as Book;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking database for book:', error);
    return null;
  }
}

/**
 * Enrich Open Library book with Google Books data
 * Includes caching and better error handling for quota limits
 */
export async function enrichBookWithGoogleBooks(olBook: any): Promise<any> {
  try {
    // Check cache first
    const cacheKey = getCacheKey(olBook);
    if (gbCache.has(cacheKey)) {
      return gbCache.get(cacheKey);
    }

    // Get API key from environment
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;

    // Build Google Books search query
    let searchQuery = '';
    if (olBook.isbn) {
      searchQuery = `isbn:${olBook.isbn}`;
    } else {
      const author = olBook.authors?.[0] || '';
      searchQuery = `intitle:${olBook.title}${author ? `+inauthor:${author}` : ''}`;
    }


    // Build URL with API key if available
    const baseUrl = GOOGLE_BOOKS_API_BASE;
    const queryParams = new URLSearchParams({
      q: searchQuery,
      maxResults: '3',
    });

    if (apiKey) {
      queryParams.append('key', apiKey);
    }

    const url = `${baseUrl}?${queryParams.toString()}`;

    const gbResponse = await fetch(url);

    // Check for rate limit error (429)
    if (gbResponse.status === 429) {
      console.warn('Google Books quota exceeded (429), using Open Library only');
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      // Cache the fallback to avoid retrying immediately
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }

    // Check for other errors
    if (!gbResponse.ok) {
      const errorText = await gbResponse.text().catch(() => 'Unknown error');
      console.warn('Google Books lookup failed:', {
        status: gbResponse.status,
        statusText: gbResponse.statusText,
        error: errorText
      });
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      // Cache the fallback to avoid retrying immediately
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }

    let gbData;
    try {
      gbData = await gbResponse.json();
    } catch (jsonError) {
      console.error('Failed to parse Google Books JSON response:', jsonError);
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }

    // Check for error in response body
    if (gbData.error) {
      console.warn('Google Books error:', gbData.error.message);
      if (gbData.error.code === 429 || gbData.error.message?.toLowerCase().includes('quota')) {
        console.warn('Google Books quota exceeded, using Open Library only');
      }
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }

    // Check if response has items
    if (!gbData || !gbData.items || !Array.isArray(gbData.items) || gbData.items.length === 0) {
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }

    const bestMatch = findBestMatch(olBook._raw || olBook, gbData.items);
    const gbBook = bestMatch?.volumeInfo;

    if (!gbBook) {
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }


    // MERGE DATA - Use best from each source
    const enrichedBook = {
      open_library_id: olBook.open_library_id,
      google_books_id: bestMatch.id || null,

      // Title/Authors: Open Library (more canonical)
      title: olBook.title,
      subtitle: gbBook.subtitle || null,
      authors: olBook.authors,

      // Description: Google Books (much better quality)
      description: gbBook.description || null,

      // Publisher/Language: Google Books (more standardized)
      publisher: gbBook.publisher || null,
      language: gbBook.language || olBook._raw?.language?.[0] || 'en',

      // Dates: Both
      published_date: resolvePublishedDate(olBook._raw || olBook, gbBook),
      first_published: olBook.first_publish_year || null,

      // Page count: Google Books (more accurate)
      page_count: gbBook.pageCount || olBook._raw?.number_of_pages_median || null,

      // Categories: Merge both
      categories: mergeCategories(
        olBook._raw?.subject || [],
        gbBook.categories || []
      ),

      // Cover: Preserve existing Open Library cover, or try Google Books, or fallback to Open Library
      cover_url: getCoverUrl(gbBook, olBook._raw || olBook, olBook.cover_url),

      // ISBNs: Use most complete
      isbn_10: gbBook.industryIdentifiers?.find((id: any) => id.type === 'ISBN_10')?.identifier
        || olBook._raw?.isbn?.find((isbn: string) => isbn.length === 10)
        || null,
      isbn_13: gbBook.industryIdentifiers?.find((id: any) => id.type === 'ISBN_13')?.identifier
        || olBook.isbn
        || olBook._raw?.isbn?.find((isbn: string) => isbn.length === 13)
        || null,

      // Ratings: Google Books
      average_rating: gbBook.averageRating || null,
      ratings_count: gbBook.ratingsCount || null,

      // Links: Google Books
      preview_link: gbBook.previewLink || null,
      info_link: gbBook.infoLink || null,
    };

    // Cache the result
    gbCache.set(cacheKey, enrichedBook);
    return enrichedBook;

  } catch (error: any) {
    console.error('Error enriching book with Google Books:', {
      error: error?.message || error,
      stack: error?.stack,
      title: olBook?.title,
      isbn: olBook?.isbn
    });
    const fallbackBook = buildBookFromOpenLibrary(olBook);
    // Cache the fallback to avoid retrying immediately
    const cacheKey = getCacheKey(olBook);
    gbCache.set(cacheKey, fallbackBook);
    return fallbackBook;
  }
}

/**
 * Fallback: Build book from Open Library only
 */
export function buildBookFromOpenLibrary(olBook: any): any {
  const raw = olBook._raw || olBook;

  // Ensure cover_url is set - use existing or build from cover_i
  let coverUrl = olBook.cover_url;
  if (!coverUrl && raw.cover_i) {
    coverUrl = `https://covers.openlibrary.org/b/id/${raw.cover_i}-L.jpg`;
  }

  return {
    open_library_id: olBook.open_library_id,
    google_books_id: null,
    title: olBook.title,
    subtitle: null,
    authors: olBook.authors,
    description: null,
    publisher: null,
    published_date: olBook.first_publish_year?.toString() || null,
    first_published: olBook.first_publish_year || null,
    page_count: raw.number_of_pages_median || null,
    categories: raw.subject?.slice(0, 5) || [],
    cover_url: coverUrl,
    language: raw.language?.[0] || 'en',
    isbn_10: raw.isbn?.find((isbn: string) => isbn.length === 10) || null,
    isbn_13: olBook.isbn || raw.isbn?.find((isbn: string) => isbn.length === 13) || null,
    average_rating: null,
    ratings_count: null,
    preview_link: null,
    info_link: null,
  };
}

/**
 * Save enriched book to database
 * Uses upsert with open_library_id as conflict key
 */
export async function saveBookToDatabase(enrichedBook: any): Promise<Book> {
  const { book } = await upsertBookViaEdge(enrichedBook);
  return book;
}
