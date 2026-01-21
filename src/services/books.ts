import { supabase } from '../config/supabase';
import { resolveCoverUrl } from './coverResolver';
import { getSuggestedGenres } from '../utils/genreMapper';

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

/**
 * Get the highest quality cover URL from Google Books imageLinks
 * Prioritizes larger images and enhances thumbnail quality when needed
 */
export function getBestCoverUrl(imageLinks?: GoogleBook['volumeInfo']['imageLinks']): string | null {
  if (!imageLinks) return null;

  // Try larger sizes first
  if (imageLinks.extraLarge) return imageLinks.extraLarge;
  if (imageLinks.large) return imageLinks.large;
  if (imageLinks.medium) return imageLinks.medium;
  if (imageLinks.small) return imageLinks.small;

  // Enhance thumbnail if available
  if (imageLinks.thumbnail) {
    return imageLinks.thumbnail
      .replace('&edge=curl', '') // Remove edge curl effect
      .replace('zoom=1', 'zoom=2') // Get 2x larger image
      .replace('zoom=2', 'zoom=3'); // Try even larger if already zoom=2
  }

  // Fallback to smallThumbnail
  if (imageLinks.smallThumbnail) {
    return imageLinks.smallThumbnail
      .replace('&edge=curl', '')
      .replace('zoom=1', 'zoom=2');
  }

  return null;
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
  started_date?: string | null; // DEPRECATED: Use read_sessions instead
  finished_date?: string | null; // DEPRECATED: Use read_sessions instead
  read_sessions?: ReadSession[]; // NEW: Multiple date ranges
  likes_count?: number | null;
  comments_count?: number | null;
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

export interface BookShelfCounts {
  read: number;
  currently_reading: number;
  want_to_read: number;
}

export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1000000) return `${Math.floor(count / 1000)}k`;
  return `${Math.floor(count / 1000000)}M`;
}

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
    console.log('Query:', normalizedQuery, 'Results:', data.docs.length);
    console.log('First 5 titles:', data.docs.slice(0, 5).map((doc: any) => doc.title));
    
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
    
    console.log(`Found ${sortedBooks.length} books from Open Library, sorted by relevance`);
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

/**
 * Manually update community statistics for a specific book
 * This is a fallback function if triggers fail or for manual refreshes
 * Calculates the same AVG and COUNT as the database trigger
 */
export async function updateBookCommunityStats(bookId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('books-update-community-stats', {
      body: { book_id: bookId },
    })

    if (error) {
      console.error('Error updating book community stats via Edge Function:', error)
      return { success: false, error }
    }

    if (!data?.success) {
      const invalidResponse = new Error('Invalid response from books-update-community-stats')
      console.error('Error updating book community stats via Edge Function:', invalidResponse)
      return { success: false, error: invalidResponse }
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('Exception updating book community stats:', error)
    return { success: false, error }
  }
}

export async function getBookCircles(
  bookId: string,
  userId?: string | null
): Promise<BookCirclesResult> {
  const defaultStats: BookCircleStats = { average: null, count: 0 };

  const { data: globalData, error: globalError } = await supabase
    .from('books_stats')
    .select('global_avg_score, global_review_count')
    .eq('book_id', bookId)
    .single();

  if (globalError && globalError.code !== 'PGRST116') {
    throw globalError;
  }

  const global: BookCircleStats = {
    average: globalData?.global_avg_score ?? null,
    count: globalData?.global_review_count ?? 0,
  };

  if (!userId) {
    return { global, friends: defaultStats };
  }

  const { data: followsData, error: followsError } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (followsError) {
    throw followsError;
  }

  const friendIds = (followsData || [])
    .map((row) => row.following_id)
    .filter((id): id is string => Boolean(id));

  if (friendIds.length === 0) {
    return { global, friends: defaultStats };
  }

  const { data: friendsData, error: friendsError } = await supabase.rpc(
    'get_friends_book_stats',
    {
      p_book_id: bookId,
      p_friend_ids: friendIds,
    }
  );

  if (friendsError) {
    throw friendsError;
  }

  const friendsRow = Array.isArray(friendsData) ? friendsData[0] : friendsData;
  const friends: BookCircleStats = {
    average: friendsRow?.avg_score ?? null,
    count: friendsRow?.review_count ?? 0,
  };

  return { global, friends };
}

export async function getBookShelfCounts(bookId: string): Promise<BookShelfCounts> {
  const emptyCounts: BookShelfCounts = {
    read: 0,
    currently_reading: 0,
    want_to_read: 0,
  };

  try {
    const { data, error } = await supabase
      .from('books_stats')
      .select('shelf_count_read, shelf_count_currently_reading, shelf_count_want_to_read')
      .eq('book_id', bookId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading shelf counts:', error);
      return emptyCounts;
    }

    if (!data) return emptyCounts;

    return {
      read: data.shelf_count_read ?? 0,
      currently_reading: data.shelf_count_currently_reading ?? 0,
      want_to_read: data.shelf_count_want_to_read ?? 0,
    };
  } catch (error) {
    console.error('Error loading shelf counts:', error);
    return emptyCounts;
  }
}

// ============================================================================
// Book Enrichment Functions
// ============================================================================

/**
 * Check if book already exists in database
 * Returns the existing book if found, null otherwise
 */
export async function checkDatabaseForBook(openLibraryId?: string | null, googleBooksId?: string | null): Promise<Book | null> {
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
        console.log('Book found in database, skipping API calls');
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
        console.log('Book found in database, skipping API calls');
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
      console.log('Using cached Google Books data');
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
    
    console.log('Enriching with Google Books:', searchQuery);
    console.log('Calling Google Books API with key:', apiKey ? 'Yes' : 'No');
    
    // Build URL with API key if available
    const baseUrl = 'https://www.googleapis.com/books/v1/volumes';
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
      console.log('Google Books returned no items for query:', searchQuery);
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }
    
    const bestMatch = findBestMatch(olBook._raw || olBook, gbData.items);
    const gbBook = bestMatch?.volumeInfo;
    
    if (!gbBook) {
      console.log('No good Google Books match, using Open Library only');
      const fallbackBook = buildBookFromOpenLibrary(olBook);
      gbCache.set(cacheKey, fallbackBook);
      return fallbackBook;
    }
    
    console.log('Merged data from both APIs');
    
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

async function upsertBookViaEdge(enrichedBook: any): Promise<{ book: Book; book_id: string }> {
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
  } catch (error) {
    // If no record found, return false
    return { exists: false };
  }
}

/**
 * Add a book to user's shelf
 * Creates book record if it doesn't exist, then creates user_books entry
 * Accepts enriched book data (from enrichBookWithGoogleBooks)
 * Returns: { userBookId, isUpdate: boolean, previousStatus?: string }
 */
export async function addBookToShelf(
  bookData: any, // Enriched book data from enrichBookWithGoogleBooks
  status: 'read' | 'currently_reading' | 'want_to_read',
  userId: string,
  options?: {
    rating?: 'liked' | 'fine' | 'disliked';
    notes?: string;
    started_date?: string;
    finished_date?: string;
    genres?: string[]; // User-selected genres (from GenreLabelPicker)
    custom_labels?: string[]; // User-selected custom labels
  }
): Promise<{ userBookId: string; isUpdate: boolean; previousStatus?: string }> {
  try {
    // Map API categories to preset genres if not already provided
    let mappedGenres: string[] = [];
    if (options?.genres && options.genres.length > 0) {
      // Use user-selected genres
      mappedGenres = options.genres;
    } else {
      // Auto-map genres from API categories (will be applied if user didn't select any)
      mappedGenres = await getSuggestedGenres(bookData.categories);
    }

    // Prepare book data with genres (will be stored when book is upserted)
    const bookDataWithGenres = {
      ...bookData,
      genres: mappedGenres, // Store mapped genres on book
    };

    const { book_id: bookId } = await upsertBookViaEdge(bookDataWithGenres);

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
      if (options?.started_date !== undefined) {
        updateData.started_date = options.started_date;
      }
      if (options?.finished_date !== undefined) {
        updateData.finished_date = options.finished_date;
      }
      if (options?.custom_labels !== undefined) {
        updateData.custom_labels = options.custom_labels;
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
    if (options?.started_date) {
      userBookData.started_date = options.started_date;
    }
    if (options?.finished_date) {
      userBookData.finished_date = options.finished_date;
    }
    if (options?.custom_labels) {
      userBookData.custom_labels = options.custom_labels;
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
          if (options?.started_date !== undefined) updateData.started_date = options.started_date;
          if (options?.finished_date !== undefined) updateData.finished_date = options.finished_date;
          if (options?.custom_labels !== undefined) updateData.custom_labels = options.custom_labels;

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

    return {
      userBookId: newUserBook.id,
      isUpdate: false,
    };
  } catch (error) {
    console.error('Error adding book to shelf:', error);
    throw error;
  }
}

/**
 * Get all books for a user, ordered by rank_score within rating categories
 */
export async function getUserBooks(userId: string): Promise<UserBook[]> {
  try {
    console.log('=== getUserBooks DEBUG ===');
    console.log('Fetching books for userId:', userId);
    
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

    console.log('=== getUserBooks RESULTS ===');
    console.log('Total books fetched:', data?.length);
    
    // Debug: Log sample book structure to verify genres are included
    if (data && data.length > 0) {
      const sampleBook = data[0];
      console.log('Sample user_book structure:', {
        id: sampleBook.id,
        custom_labels: sampleBook.custom_labels,
        has_book: !!sampleBook.book,
        book_id: sampleBook.book?.id,
        book_title: sampleBook.book?.title,
        book_genres: sampleBook.book?.genres,
        book_categories: sampleBook.book?.categories,
      });
      
      // Count books with genres
      const booksWithGenres = data.filter(b => b.book?.genres && b.book.genres.length > 0);
      console.log('Books with genres:', booksWithGenres.length, '/', data.length);
      
      // Count books with custom_labels
      const booksWithLabels = data.filter(b => b.custom_labels && b.custom_labels.length > 0);
      console.log('Books with custom_labels:', booksWithLabels.length, '/', data.length);
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
 * Format rank score for display (rounds to one decimal place)
 * Helper function to format score for display
 */
export function formatRankScore(score: number | null): string {
  if (score === null || score === undefined) return '--';
  return score.toFixed(1); // Always show one decimal place
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
      console.log('updateBookStatus: using no-touch RPC', {
        userBookId,
        newStatus,
        clearRankScore: options?.clearRankScore ?? false,
      });
      const { data, error } = await supabase.rpc('update_user_book_status_no_touch', {
        p_user_book_id: userBookId,
        p_status: newStatus,
        p_clear_rank_score: options?.clearRankScore ?? false,
      });
      if (error) {
        console.error('updateBookStatus: no-touch RPC error', error);
      } else {
        console.log('updateBookStatus: no-touch RPC success');
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
 * NOTE: started_date and finished_date are DEPRECATED. Use read_sessions (addReadSession, updateReadSession, deleteReadSession) instead.
 * These parameters are kept for backward compatibility during migration period.
 */
export async function updateUserBookDetails(
  userBookId: string,
  userId: string,
  updates: {
    status?: 'read' | 'currently_reading' | 'want_to_read' | null;
    rating?: 'liked' | 'fine' | 'disliked' | null;
    notes?: string | null;
    custom_labels?: string[] | null;
    /** @deprecated Use read_sessions (addReadSession) instead */
    started_date?: string | null;
    /** @deprecated Use read_sessions (addReadSession) instead */
    finished_date?: string | null;
  },
  options?: {
    touchUpdatedAt?: boolean;
  }
): Promise<{ data: any; error: any }> {
  try {
    if (options?.touchUpdatedAt === false) {
      console.log('updateUserBookDetails: using no-touch RPC', {
        userBookId,
        updates,
      });
      // Note: started_date and finished_date are deprecated - use read_sessions instead
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
      } else {
        console.log('updateUserBookDetails: no-touch RPC success');
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
        
        console.log('=== RANKING DEBUG: updateUserBookDetails - rating check ===');
        console.log('Current rating:', currentBook?.rating);
        console.log('New rating:', updates.rating);
        console.log('Current rank_score:', currentBook?.rank_score);
        console.log('Is rating changing?', isRatingChanging);
        console.log('Will set rank_score?', !currentBook?.rank_score && isRatingChanging);
        
        // CRITICAL: If rank_score is already set, NEVER overwrite it
        if (currentBook?.rank_score !== null && currentBook?.rank_score !== undefined) {
          console.log('=== RANKING DEBUG: WARNING - rank_score already set, NOT overwriting ===');
          console.log('Existing rank_score:', currentBook.rank_score);
          console.log('This function should NOT be called after ranking completes!');
        }
        
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
            console.log('Setting default rank_score:', updateData.rank_score, 'for rating:', updates.rating);
          } else {
            console.log('Leaving rank_score as null - will be set during ranking. Found', categoryBooks.length, 'other books in category');
          }
          // Otherwise, rank_score stays null and will be set during ranking
        } else {
          console.log('Not setting rank_score - already set or rating not changing');
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
    // Note: started_date and finished_date are deprecated - use read_sessions instead
    // Removed to prevent errors since columns no longer exist

    console.log('=== updateUserBookDetails: final updateData ===', updateData);
    console.log('userBookId:', userBookId);

    const { data, error } = await supabase
      .from('user_books')
      .update(updateData)
      .eq('id', userBookId);

    if (error) {
      console.error('=== updateUserBookDetails: update error ===', error);
    } else {
      console.log('=== updateUserBookDetails: update success ===');
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
    console.log('=== getRecentUserBooks: Fetching ===');
    console.log('User ID:', userId);
    console.log('Limit:', limit);
    
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

    console.log('=== getRecentUserBooks: Results (before filtering) ===');
    console.log('Total books fetched:', data?.length);
    data?.forEach((book, idx) => {
      console.log(`  ${idx}: ${book.book?.title || 'No title'} - rank_score: ${book.rank_score}, rating: ${book.rating}, updated_at: ${book.updated_at}`);
    });

    // Filter to only show meaningful updates (status, rating, notes changes)
    // Rank_score updates don't change updated_at, so they won't appear here
    // This is intentional - we only want to show user-initiated changes
    const result = (data || [])
      .map((item) => ({
        ...item,
        book: item.book as Book,
      }))
      .slice(0, limit) as UserBook[]; // Take first N after filtering
    
    console.log('=== getRecentUserBooks: Returning ===');
    console.log('Result count:', result.length);
    
    return result;
  } catch (error) {
    console.error('Error fetching recent user books:', error);
    throw error;
  }
}

/**
 * Get friends' user_books for a specific book that have been ranked
 * Returns user_books with user profile data, ordered by rank_score (highest first)
 * Supports pagination with offset and limit parameters
 */
export async function getFriendsRankingsForBook(
  bookId: string,
  userId: string,
  options?: {
    offset?: number;
    limit?: number;
  }
): Promise<{
  rankings: Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>;
  totalCount: number;
}> {
  try {
    // First, get the list of users the current user follows
    const { data: followingData, error: followingError } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followingError) {
      console.error('Error fetching following list:', followingError);
      throw new Error('Failed to fetch following list');
    }

    const friendIds = (followingData || [])
      .map((row) => row.following_id)
      .filter((id): id is string => Boolean(id));

    if (friendIds.length === 0) {
      return { rankings: [], totalCount: 0 };
    }

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // First, get total count
    const { count: totalCount, error: countError } = await supabase
      .from('user_books')
      .select('*', { count: 'exact', head: true })
      .eq('book_id', bookId)
      .in('user_id', friendIds)
      .not('rank_score', 'is', null);

    if (countError) {
      console.error('Error fetching friends rankings count:', countError);
      throw new Error('Failed to fetch rankings count');
    }

    // Query user_books for friends who have ranked this book (with pagination)
    const query = supabase
      .from('user_books')
      .select(
        `
        *,
        book:books(*)
      `
      )
      .eq('book_id', bookId)
      .in('user_id', friendIds)
      .not('rank_score', 'is', null)
      .order('rank_score', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: userBooksData, error: userBooksError } = await query;

    if (userBooksError) {
      console.error('Error fetching friends rankings:', userBooksError);
      throw new Error('Failed to fetch friends rankings');
    }

    if (!userBooksData || userBooksData.length === 0) {
      return { rankings: [], totalCount: totalCount ?? 0 };
    }

    // Fetch user profiles for all the users
    const userIds = Array.from(new Set(userBooksData.map((ub) => ub.user_id)));
    const { data: profilesData, error: profilesError } = await supabase
      .from('user_profiles')
      .select('user_id, username, profile_photo_url')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error fetching user profiles:', profilesError);
      // Still return rankings even if profile fetch fails (profiles will be undefined)
    }

    // Create a map of user_id to profile
    const profileMap = new Map(
      (profilesData || []).map((profile) => [profile.user_id, profile])
    );

    // Merge user_books with profiles
    const rankings = userBooksData.map((item) => ({
      ...item,
      book: item.book as Book,
      user_profile: profileMap.get(item.user_id),
    })) as Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>;

    return {
      rankings,
      totalCount: totalCount ?? 0,
    };
  } catch (error) {
    console.error('Error fetching friends rankings for book:', error);
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

/**
 * Update book genres (mapped preset genres)
 * Uses Edge Function to bypass RLS on books table
 */
export async function updateBookGenres(
  bookId: string,
  genres: string[]
): Promise<{ error: any }> {
  try {
    console.log('=== updateBookGenres ===');
    console.log('bookId:', bookId);
    console.log('genres:', genres);
    
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

    console.log('=== updateBookGenres: success ===');
    console.log('Updated genres:', data.genres);
    return { error: null };
  } catch (error) {
    console.error('Error updating book genres:', error);
    return { error };
  }
}
