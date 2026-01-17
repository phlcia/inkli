import { supabase } from '../config/supabase';

// Preset genres that users can select
export const PRESET_GENRES = [
  'Fiction',
  'Non-Fiction',
  'Mystery/Thriller',
  'Romance',
  'Sci-Fi/Fantasy',
  'Biography/Memoir',
  'Self-Help/Business',
  'Historical',
  'Literary Fiction',
  'Young Adult',
  'Horror',
  'Contemporary',
  'Classics',
] as const;

export type PresetGenre = typeof PRESET_GENRES[number];

// Lookup table mapping API category strings to preset genres
// Start with 30-50 most common entries, expand based on unmapped_genres_log data
const GENRE_LOOKUP_TABLE: Record<string, PresetGenre[]> = {
  // Sci-Fi/Fantasy variations
  'Science Fiction': ['Sci-Fi/Fantasy'],
  'Science fiction': ['Sci-Fi/Fantasy'],
  'Fantasy': ['Sci-Fi/Fantasy'],
  'Sci-Fi': ['Sci-Fi/Fantasy'],
  'Speculative fiction': ['Sci-Fi/Fantasy'],
  
  // Historical variations
  'History': ['Historical'],
  'World War II': ['Historical'],
  'American Civil War': ['Historical'],
  'Ancient history': ['Historical'],
  'Historical': ['Historical'],
  
  // Literary Fiction variations
  'Literary Fiction': ['Literary Fiction'],
  'American literature': ['Literary Fiction'],
  'British literature': ['Literary Fiction'],
  'Contemporary fiction': ['Contemporary', 'Fiction'],
  'Modern fiction': ['Contemporary', 'Fiction'],
  
  // Mystery/Thriller variations
  'Mystery': ['Mystery/Thriller'],
  'Thriller': ['Mystery/Thriller'],
  'Detective': ['Mystery/Thriller'],
  'Crime': ['Mystery/Thriller'],
  'Suspense': ['Mystery/Thriller'],
  
  // Romance variations
  'Romance': ['Romance'],
  'Love stories': ['Romance'],
  'Romantic fiction': ['Romance'],
  
  // YA variations
  'Young Adult Fiction': ['Young Adult'],
  'YA': ['Young Adult'],
  'Teen fiction': ['Young Adult'],
  
  // Horror variations
  'Horror': ['Horror'],
  'Gothic': ['Horror'],
  
  // Biography/Memoir variations
  'Biography': ['Biography/Memoir'],
  'Memoir': ['Biography/Memoir'],
  'Autobiography': ['Biography/Memoir'],
  
  // Additional common entries
  'Self-help': ['Self-Help/Business'],
  'Business': ['Self-Help/Business'],
  'Fiction': ['Fiction'],
  'Non-fiction': ['Non-Fiction'],
  'Non-Fiction': ['Non-Fiction'],
};

/**
 * Normalize a category string for lookup (lowercase, trim)
 */
function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

/**
 * Enhanced fallback heuristic for when mapping returns empty
 */
function getFallbackGenre(apiCategories: string[]): PresetGenre[] {
  const categoriesLower = apiCategories.join(' ').toLowerCase();
  
  // Handle poetry/drama edge cases
  if (categoriesLower.includes('poetry') || categoriesLower.includes('drama')) {
    return ['Literary Fiction'];
  }
  
  // Standard fiction check
  if (categoriesLower.includes('fiction')) {
    return ['Fiction'];
  }
  
  // Default to non-fiction
  return ['Non-Fiction'];
}

/**
 * Log an unmapped API category to the database
 */
async function logUnmappedCategory(apiCategory: string, bookId?: string): Promise<void> {
  try {
    await supabase
      .from('unmapped_genres_log')
      .insert({
        api_category: apiCategory,
        book_id: bookId || null,
      });
  } catch (error) {
    // Fail silently - don't break book addition if logging fails
    console.error('Failed to log unmapped category:', error);
  }
}

/**
 * Map API categories to preset genres using lookup table
 * Logs unmapped categories for future lookup table expansion
 * 
 * @param apiCategories - Array of category strings from API
 * @param bookId - Optional book ID for logging purposes
 * @returns Array of mapped preset genres (deduplicated)
 */
export async function mapApiCategoriesToGenres(
  apiCategories: string[] | null | undefined,
  bookId?: string
): Promise<PresetGenre[]> {
  if (!apiCategories || apiCategories.length === 0) {
    return getFallbackGenre([]);
  }

  const mappedGenres: PresetGenre[] = [];
  const normalizedTable: Record<string, PresetGenre[]> = {};
  
  // Pre-normalize lookup table keys for efficiency
  Object.keys(GENRE_LOOKUP_TABLE).forEach(key => {
    normalizedTable[normalizeCategory(key)] = GENRE_LOOKUP_TABLE[key];
  });

  // Map each API category
  for (const category of apiCategories) {
    const normalized = normalizeCategory(category);
    const mapped = normalizedTable[normalized];
    
    if (mapped) {
      mappedGenres.push(...mapped);
    } else {
      // Log unmapped category
      await logUnmappedCategory(category, bookId);
    }
  }

  // Deduplicate and return
  if (mappedGenres.length > 0) {
    return Array.from(new Set(mappedGenres));
  }

  // If no mappings found, use fallback
  return getFallbackGenre(apiCategories);
}

/**
 * Get suggested genres for a book based on API categories
 * This is the main function to call when adding/updating a book
 */
export async function getSuggestedGenres(
  apiCategories: string[] | null | undefined,
  bookId?: string
): Promise<PresetGenre[]> {
  return mapApiCategoriesToGenres(apiCategories, bookId);
}
