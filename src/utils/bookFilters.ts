import { UserBook } from '../services/books';

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
  // If nothing selected, return all books
  if (selectedGenres.length === 0 && selectedCustomLabels.length === 0) {
    return books;
  }

  return books.filter((book) => {
    const bookGenres = book.book?.genres || [];
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

    // If both filters active: book must match both
    // If only one filter active: book must match that one
    return matchesGenre && matchesCustomLabel;
  });
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
