import { supabase } from '../config/supabase';

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
  average_rating: number | null;
  ratings_count: number | null;
  language: string | null;
  cover_url: string | null;
  preview_link: string | null;
  info_link: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  community_average_score: number | null;
  community_rank_count: number;
  stats_last_updated: string | null;
  created_at: string;
}

export interface UserBook {
  id: string;
  user_id: string;
  book_id: string;
  rank_score: number | null;
  status: 'read' | 'currently_reading' | 'want_to_read';
  rating?: 'liked' | 'fine' | 'disliked';
  notes?: string | null;
  started_date?: string | null;
  finished_date?: string | null;
  created_at: string;
  updated_at: string;
  book?: Book;
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
 * Find best Google Books match for an Open Library book
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
    
    // Author match
    const olAuthor = olBook.author_name?.[0]?.toLowerCase() || '';
    const gbAuthor = book.authors?.[0]?.toLowerCase() || '';
    if (olAuthor && gbAuthor) {
      const olLastName = olAuthor.split(' ').pop() || '';
      const gbLastName = gbAuthor.split(' ').pop() || '';
      if (olLastName && gbLastName && 
          (olLastName.includes(gbLastName) || gbLastName.includes(olLastName))) {
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
 */
export async function searchBooks(query: string): Promise<any[]> {
  try {
    // Use Open Library for search (deduplicated results)
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20`
    );
    
    if (!response.ok) {
      throw new Error('Open Library search failed');
    }
    
    const data = await response.json();
    
    const books = data.docs.map((book: any) => ({
      open_library_id: book.key, // e.g., "/works/OL45804W"
      title: book.title,
      authors: book.author_name || [],
      cover_url: book.cover_i 
        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
        : null,
      first_publish_year: book.first_publish_year,
      isbn: book.isbn?.[0],
      _raw: book // Keep raw data for enrichment
    }));
    
    console.log(`Found ${books.length} books from Open Library`);
    return books;
    
  } catch (error) {
    console.error('Open Library search error:', error);
    return [];
  }
}

/**
 * Search books with stats (average score and member count)
 * Uses pre-calculated community statistics from the books table (updated via triggers)
 */
export async function searchBooksWithStats(query: string): Promise<any[]> {
  try {
    // First, search Open Library
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
    // Calculate average rank_score and count distinct users
    // Only count rows where rank_score IS NOT NULL
    const { data: statsData, error: statsError } = await supabase
      .from('user_books')
      .select('rank_score, user_id')
      .eq('book_id', bookId)
      .not('rank_score', 'is', null);

    if (statsError) {
      console.error('Error fetching book stats for manual update:', statsError);
      return { success: false, error: statsError };
    }

    // Calculate average score and member count (distinct users)
    const rankScores = (statsData || []).map((ub: any) => ub.rank_score);
    const uniqueUserIds = new Set((statsData || []).map((ub: any) => ub.user_id));
    
    const average_score = rankScores.length > 0
      ? rankScores.reduce((sum: number, score: number) => sum + score, 0) / rankScores.length
      : null;
    const member_count = uniqueUserIds.size;

    // Round average_score to 2 decimal places (matching DECIMAL(3,2))
    const roundedAverage = average_score !== null 
      ? Math.round(average_score * 100) / 100 
      : null;

    // Update the books table with calculated stats
    const { error: updateError } = await supabase
      .from('books')
      .update({
        community_average_score: roundedAverage,
        community_rank_count: member_count,
        stats_last_updated: new Date().toISOString(),
      })
      .eq('id', bookId);

    if (updateError) {
      console.error('Error updating book community stats:', updateError);
      return { success: false, error: updateError };
    }

    console.log(`Updated community stats for book ${bookId}: avg=${roundedAverage}, count=${member_count}`);
    return { success: true, error: null };
  } catch (error) {
    console.error('Exception updating book community stats:', error);
    return { success: false, error };
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
  const bookDataToInsert = {
    open_library_id: enrichedBook.open_library_id || null,
    google_books_id: enrichedBook.google_books_id || null,
    title: enrichedBook.title,
    subtitle: enrichedBook.subtitle || null,
    authors: enrichedBook.authors || [],
    publisher: enrichedBook.publisher || null,
    published_date: enrichedBook.published_date || null,
    first_published: enrichedBook.first_published || null,
    description: enrichedBook.description || null,
    page_count: enrichedBook.page_count || null,
    categories: enrichedBook.categories || null,
    average_rating: enrichedBook.average_rating || null,
    ratings_count: enrichedBook.ratings_count || null,
    language: enrichedBook.language || null,
    cover_url: enrichedBook.cover_url || null,
    preview_link: enrichedBook.preview_link || null,
    info_link: enrichedBook.info_link || null,
    isbn_10: enrichedBook.isbn_10 || null,
    isbn_13: enrichedBook.isbn_13 || null,
  };

  const { data, error } = await supabase
    .from('books')
    .upsert(bookDataToInsert, {
      onConflict: 'open_library_id',
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error saving book:', error);
    throw error;
  }
  
  return data as Book;
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
  }
): Promise<{ userBookId: string; isUpdate: boolean; previousStatus?: string }> {
  try {
    // Prepare complete book data from enriched book
    const bookDataToInsert = {
      open_library_id: bookData.open_library_id || null,
      google_books_id: bookData.google_books_id || null,
      title: bookData.title,
      subtitle: bookData.subtitle || null,
      authors: bookData.authors || [],
      publisher: bookData.publisher || null,
      published_date: bookData.published_date || null,
      first_published: bookData.first_published || null,
      description: bookData.description || null,
      page_count: bookData.page_count || null,
      categories: bookData.categories || null,
      average_rating: bookData.average_rating || null,
      ratings_count: bookData.ratings_count || null,
      language: bookData.language || null,
      cover_url: bookData.cover_url || null,
      preview_link: bookData.preview_link || null,
      info_link: bookData.info_link || null,
      isbn_10: bookData.isbn_10 || null,
      isbn_13: bookData.isbn_13 || null,
    };

    // Check if book already exists in books table
    // Try open_library_id first, then google_books_id
    let existingBook = null;
    if (bookData.open_library_id) {
      const { data } = await supabase
      .from('books')
      .select('id')
        .eq('open_library_id', bookData.open_library_id)
      .single();
      existingBook = data;
    }
    
    if (!existingBook && bookData.google_books_id) {
      const { data } = await supabase
        .from('books')
        .select('id')
        .eq('google_books_id', bookData.google_books_id)
        .single();
      existingBook = data;
    }

    let bookId: string;

    if (existingBook) {
      bookId = existingBook.id;
      // Update existing book with any new data (in case we have more complete info now)
      await supabase
        .from('books')
        .update(bookDataToInsert)
        .eq('id', bookId);
    } else {
      // Insert new book with all fields
      // Use upsert with conflict resolution on open_library_id if available
      if (bookDataToInsert.open_library_id) {
        const { data: newBook, error: bookError } = await supabase
          .from('books')
          .upsert(bookDataToInsert, {
            onConflict: 'open_library_id',
          })
          .select('id')
          .single();

        if (bookError) throw bookError;
        bookId = newBook.id;
      } else {
        // Fallback to regular insert if no open_library_id
      const { data: newBook, error: bookError } = await supabase
        .from('books')
        .insert(bookDataToInsert)
        .select('id')
        .single();

      if (bookError) throw bookError;
      bookId = newBook.id;
      }
    }

    // Check if user already has this book
    const existingCheck = await checkUserHasBook(bookId, userId);

    if (existingCheck.exists && existingCheck.userBookId) {
      // Book already exists - update it instead of inserting
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

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

    if (error) throw error;

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
 * Update rank_score for a single book based on its position in the category
 * Uses high-precision fractional scores (5+ decimal places) without renormalizing other books
 * Only updates the new book - does NOT update updated_at to avoid showing in recent activity
 */
export async function updateBookRankScore(
  userId: string,
  rating: 'liked' | 'fine' | 'disliked',
  newBookUserBookId: string,
  position: number
): Promise<number> {
  try {
    console.log('=== RANKING: updateBookRankScore ===');
    console.log('User ID:', userId);
    console.log('Rating:', rating);
    console.log('New book userBookId:', newBookUserBookId);
    console.log('Position:', position);

    // Get books in category that already have rank_score (we'll filter out the new book in JavaScript)
    // Only include books with non-null rank_score for comparison
    const { data: allCategoryBooks, error: fetchError } = await supabase
      .from('user_books')
      .select('id, rank_score')
      .eq('user_id', userId)
      .eq('rating', rating)
      .not('rank_score', 'is', null)
      .order('rank_score', { ascending: false });
    
    if (fetchError) throw fetchError;

    // Filter out the new book (in case it somehow got included)
    const categoryBooks = (allCategoryBooks || []).filter(
      (book: { id: string; rank_score: number | null }) => book.id !== newBookUserBookId && book.rank_score !== null
    );

    console.log('=== RANKING: Fetched books ===');
    console.log('Total books in category (excluding new):', categoryBooks.length);
    categoryBooks.forEach((book: { id: string; rank_score: number | null }, idx: number) => {
      console.log(`  ${idx}: ${book.id} (score: ${book.rank_score})`);
    });

    // Define score ranges by category
    // Note: NUMERIC(4,2) constraint allows values up to 99.99
    const maxScore = rating === 'liked' ? 10.0 : rating === 'fine' ? 6.99 : 4.99;
    const minScore = rating === 'liked' ? 8.0 : rating === 'fine' ? 5.0 : 1.0;

    let newScore: number;

    if (!categoryBooks || categoryBooks.length === 0) {
      // First book in category - use default
      newScore = rating === 'liked' ? 9.0 : rating === 'fine' ? 5.5 : 3.0;
      console.log('=== RANKING: First book in category, using default ===');
      console.log('Default score:', newScore);
    } else if (position === 0) {
      // Better than current best
      const topScore = categoryBooks[0].rank_score;
      newScore = topScore + 0.1;
      
      // If top book is already at or very close to maxScore, allow going slightly above
      // to ensure the new book appears above (not tied)
      if (topScore >= maxScore - 0.0001) {
        // Use a tiny increment above maxScore to ensure it's above
        newScore = maxScore + 0.00001;
        console.log('=== RANKING: Better than best (at max boundary) ===');
        console.log('Top score:', topScore);
        console.log('New score (above max):', newScore);
      } else {
        // Cap at category max if we're not at the boundary
        newScore = Math.min(newScore, maxScore);
        console.log('=== RANKING: Better than best ===');
        console.log('Top score:', topScore);
        console.log('New score:', newScore);
      }
    } else if (position >= categoryBooks.length) {
      // Worse than current worst
      const bottomScore = categoryBooks[categoryBooks.length - 1].rank_score;
      newScore = bottomScore - 0.1;
      
      // If bottom book is already at or very close to minScore, allow going slightly below
      // to ensure the new book appears below (not tied)
      if (bottomScore <= minScore + 0.0001) {
        // Use a tiny decrement below minScore to ensure it's below
        newScore = minScore - 0.00001;
        console.log('=== RANKING: Worse than worst (at min boundary) ===');
        console.log('Bottom score:', bottomScore);
        console.log('New score (below min):', newScore);
      } else {
        // Floor at category min if we're not at the boundary
        newScore = Math.max(newScore, minScore);
        console.log('=== RANKING: Worse than worst ===');
        console.log('Bottom score:', bottomScore);
        console.log('New score:', newScore);
      }
    } else {
      // Between two books - use precise midpoint
      const upperScore = categoryBooks[position - 1].rank_score;
      const lowerScore = categoryBooks[position].rank_score;
      const gap = upperScore - lowerScore;
      
      // Use high-precision midpoint for even distribution
      // This gives us ~100,000 possible values between any two scores
      newScore = (upperScore + lowerScore) / 2;
      
      // If gap is getting too small (less than 0.00002), we're running out of room
      // This would only happen after 50,000+ rankings between two books (unrealistic)
      if (gap < 0.00002) {
        console.warn('=== RANKING: WARNING - Scores getting very close, consider renormalization ===', {
          upperScore,
          lowerScore,
          gap
        });
        // Still place it, just with minimum precision
        newScore = lowerScore + 0.00001;
      }
      
      console.log('=== RANKING: Between two books ===');
      console.log('Upper score:', upperScore);
      console.log('Lower score:', lowerScore);
      console.log('Gap:', gap);
      console.log('New score (midpoint):', newScore);
    }

    // Calculate precision for logging
    const precision = newScore.toString().split('.')[1]?.length || 0;
    
    // Log precision tracking
    console.log('=== RANKING: Score precision check ===');
    console.log('Score:', newScore);
    console.log('Decimals:', precision);
    console.log('Formatted:', formatRankScore(newScore));
    console.log('Category:', rating);
    console.log('Position:', position);

    // Store with full precision (no rounding) - database supports arbitrary precision
    // JavaScript uses IEEE 754 double precision, which handles 5+ decimal places fine

    // Update ONLY the new book
    // IMPORTANT: Do NOT update updated_at - we don't want rank_score updates in recent activity
    const { data: updateData, error: updateError } = await supabase
      .from('user_books')
      .update({ 
        rank_score: newScore
        // Note: updated_at is NOT updated - this prevents rank_score changes from appearing in recent activity
      })
      .eq('id', newBookUserBookId)
      .select('id, rank_score')
      .single();

    if (updateError) {
      console.error('=== RANKING: ERROR updating book ===', updateError);
      throw updateError;
    }

    // Verify the update worked
    if (!updateData) {
      console.error('=== RANKING: ERROR - No data returned from update ===');
      throw new Error('Update returned no data');
    }

    if (updateData.rank_score !== newScore) {
      console.error('=== RANKING: ERROR - Score mismatch after update ===');
      console.error('Expected score:', newScore);
      console.error('Actual score in DB:', updateData.rank_score);
      throw new Error(`Score mismatch: expected ${newScore}, got ${updateData.rank_score}`);
    }

    console.log('=== RANKING: Complete ===');
    console.log('New book score:', newScore);
    console.log('Precision:', precision, 'decimal places');
    console.log('Updated only the new book (no renormalization)');
    console.log('Verified: rank_score in database matches expected value');

    return newScore;
  } catch (error) {
    console.error('=== RANKING: ERROR ===', error);
    throw error;
  }
}

/**
 * Update the rank_score of a book in user's shelf (legacy function)
 * @deprecated Use updateBookRankScore(userId, rating, userBookId, position) instead
 */
export async function updateBookRankScoreLegacy(
  userBookId: string,
  rankScore: number
): Promise<void> {
  try {
    console.log('=== RANKING DEBUG: updateBookRankScore ===');
    console.log('Function called with:', { userBookId, rankScore });
    console.log('RankScore type:', typeof rankScore);
    console.log('RankScore value:', rankScore);
    console.log('RankScore is valid?', typeof rankScore === 'number' && !isNaN(rankScore));
    
    if (rankScore === null || rankScore === undefined || isNaN(rankScore)) {
      console.error('=== RANKING DEBUG: ERROR - Invalid rankScore ===', rankScore);
      throw new Error(`Invalid rankScore: ${rankScore}`);
    }
    
    console.log('Updating database...');
    const updateData = { 
      rank_score: rankScore, 
      updated_at: new Date().toISOString() 
    };
    console.log('Update data:', updateData);
    
    const { data, error } = await supabase
      .from('user_books')
      .update(updateData)
      .eq('id', userBookId)
      .select('id, rank_score, rating')
      .single();

    if (error) {
      console.error('=== RANKING DEBUG: Database error ===');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error);
      throw error;
    }
    
    console.log('=== RANKING DEBUG: Database update successful ===');
    console.log('Returned data:', data);
    console.log('Updated rank_score:', data?.rank_score);
    console.log('Updated rating:', data?.rating);
    
    if (data?.rank_score !== rankScore) {
      console.error('=== RANKING DEBUG: WARNING - Score mismatch after update ===');
      console.error('Expected:', rankScore);
      console.error('Got:', data?.rank_score);
    } else {
      console.log('=== RANKING DEBUG: SUCCESS - Score matches expected value ===');
    }
  } catch (error) {
    console.error('=== RANKING DEBUG: ERROR in updateBookRankScore ===');
    const err = error as any;
    console.error('Error type:', err?.constructor?.name);
    console.error('Error message:', err?.message);
    console.error('Full error:', error);
    throw error;
  }
}

/**
 * Update book status (read, currently_reading, want_to_read)
 */
export async function updateBookStatus(
  userBookId: string,
  newStatus: 'read' | 'currently_reading' | 'want_to_read'
): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_books')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userBookId);

    return { data, error };
  } catch (error) {
    console.error('Error updating book status:', error);
    throw error;
  }
}

/**
 * Get default score for a rating category
 */
function getDefaultScoreForRating(rating: 'liked' | 'fine' | 'disliked'): number {
  switch (rating) {
    case 'liked':
      return 10.0;
    case 'fine':
      return 6.0;
    case 'disliked':
      return 4.0;
  }
}

/**
 * Update user book with rating, notes, and dates
 * If rating is set and rank_score is null, check if this is the first book in category
 * If so, set default score; otherwise leave null for ranking process
 */
export async function updateUserBookDetails(
  userBookId: string,
  userId: string,
  updates: {
    status?: 'read' | 'currently_reading' | 'want_to_read';
    rating?: 'liked' | 'fine' | 'disliked' | null;
    notes?: string | null;
    started_date?: string | null;
    finished_date?: string | null;
  }
): Promise<{ data: any; error: any }> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

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
    if (updates.started_date !== undefined) updateData.started_date = updates.started_date;
    if (updates.finished_date !== undefined) updateData.finished_date = updates.finished_date;

    const { data, error } = await supabase
      .from('user_books')
      .update(updateData)
      .eq('id', userBookId);

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
