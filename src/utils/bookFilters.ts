import { UserBook } from '../services/books';

/**
 * Get the effective genres for a user's book
 * Only returns genres that the user has explicitly set (user_genres)
 * Does NOT fall back to book's default genres
 * 
 * Note: Empty array [] or null/undefined means no genres for filtering
 */
export function getEffectiveGenres(userBook: UserBook): string[] {
  // Only return user's explicitly set genres (no fallback to book defaults)
  return userBook.user_genres || [];
}

/**
 * Filter books by selected genres and custom labels
 * 
 * Logic:
 * - If only genres selected: book matches if it has ANY selected genre (OR)
 * - If only custom labels selected: book matches if it has ANY selected label (OR)
 * - If BOTH selected: book must have (ANY selected genre) AND (ANY selected custom label)
 * - If nothing selected: return all books
 */
export function filterBooks(
  books: UserBook[],
  selectedGenres: string[],
  selectedCustomLabels: string[]
): UserBook[] {
  console.log('=== filterBooks DEBUG ===');
  console.log('Input:', {
    totalBooks: books.length,
    selectedGenres,
    selectedCustomLabels,
  });

  // If nothing selected, return all books
  if (selectedGenres.length === 0 && selectedCustomLabels.length === 0) {
    console.log('No filters selected, returning all books');
    return books;
  }

  // Debug: Show what data we have to filter
  const booksWithGenres = books.filter(b => getEffectiveGenres(b).length > 0);
  const booksWithLabels = books.filter(b => b.custom_labels && b.custom_labels.length > 0);
  console.log('Books with genres:', booksWithGenres.length);
  console.log('Books with custom_labels:', booksWithLabels.length);
  
  // Show first 3 books' data
  books.slice(0, 3).forEach((book, idx) => {
    console.log(`Book ${idx}:`, {
      title: book.book?.title,
      effectiveGenres: getEffectiveGenres(book),
      user_genres: book.user_genres,
      book_genres: book.book?.genres,
      custom_labels: book.custom_labels,
    });
  });

  const result = books.filter((book) => {
    // Use effective genres (user override or book default)
    const bookGenres = getEffectiveGenres(book);
    const bookCustomLabels = book.custom_labels || [];

    // Check genre filter
    let matchesGenre = true;
    if (selectedGenres.length > 0) {
      // Book must have at least one of the selected genres (OR logic)
      matchesGenre = selectedGenres.some((genre) => bookGenres.includes(genre));
    }

    // Check custom label filter
    let matchesCustomLabel = true;
    if (selectedCustomLabels.length > 0) {
      // Book must have at least one of the selected custom labels (OR logic)
      matchesCustomLabel = selectedCustomLabels.some((label) => 
        bookCustomLabels.includes(label)
      );
    }

    const matches = matchesGenre && matchesCustomLabel;
    
    // Debug individual book matching (only log non-matches to reduce noise)
    if (!matches && (selectedGenres.length > 0 || selectedCustomLabels.length > 0)) {
      console.log(`Book "${book.book?.title}" did NOT match:`, {
        bookGenres,
        bookCustomLabels,
        matchesGenre,
        matchesCustomLabel,
      });
    }

    // If both filters active: book must match both
    // If only one filter active: book must match that one
    return matches;
  });

  console.log('=== filterBooks RESULT ===');
  console.log('Filtered count:', result.length, '/', books.length);
  
  return result;
}

/**
 * Group filtered books by shelf
 */
export function groupBooksByShelf(books: UserBook[]): {
  read: UserBook[];
  currently_reading: UserBook[];
  want_to_read: UserBook[];
} {
  const grouped = {
    read: [] as UserBook[],
    currently_reading: [] as UserBook[],
    want_to_read: [] as UserBook[],
  };

  for (const book of books) {
    if (book.status === 'read') {
      grouped.read.push(book);
    } else if (book.status === 'currently_reading') {
      grouped.currently_reading.push(book);
    } else if (book.status === 'want_to_read') {
      grouped.want_to_read.push(book);
    }
  }

  return grouped;
}

/**
 * Get count of filtered books by shelf
 */
export function getFilteredBookCounts(
  books: UserBook[],
  selectedGenres: string[],
  selectedCustomLabels: string[]
): {
  total: number;
  read: number;
  currently_reading: number;
  want_to_read: number;
} {
  const filtered = filterBooks(books, selectedGenres, selectedCustomLabels);
  const grouped = groupBooksByShelf(filtered);

  return {
    total: filtered.length,
    read: grouped.read.length,
    currently_reading: grouped.currently_reading.length,
    want_to_read: grouped.want_to_read.length,
  };
}
