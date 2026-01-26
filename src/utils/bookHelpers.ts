import { Book } from '../services/books';

/**
 * Checks if a book has minimal data and needs enrichment.
 */
export function isBookSparse(book: Book | null): boolean {
  if (!book) return false;

  // A book is sparse if it's missing ISBN (key indicator it hasn't been enriched).
  return !book.isbn_13 && !book.isbn_10;
}
