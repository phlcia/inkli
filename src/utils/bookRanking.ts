/**
 * Binary Search-Based Book Ranking System
 * 
 * This module implements a binary search algorithm for ranking books through
 * pairwise comparisons. It minimizes the number of comparisons needed (O(log n))
 * by using binary search to find the correct position for a new book.
 */

export interface RankedBook {
  id: string;
  title: string;
  authors?: string[];
  cover_url?: string | null;
  score: number; // Numerical score (higher = better rank)
}

export interface ComparisonState {
  // The two books currently being compared
  bookA: RankedBook | null;
  bookB: RankedBook | null;
  
  // Binary search state
  left: number;      // Left boundary of search range
  right: number;     // Right boundary of search range
  middle: number;    // Current middle index being compared
  
  // Status
  isComplete: boolean;  // Whether the binary search is complete
  finalPosition: number | null; // Final insertion position (when complete)
  finalScore: number | null;     // Final calculated score (when complete)
}

export interface RankingState {
  books: RankedBook[]; // Sorted by score (highest first)
  comparisonState: ComparisonState | null;
}

/**
 * Initialize ranking state with existing books
 * Books should be sorted by score (highest first)
 */
export function initializeRanking(existingBooks: RankedBook[]): RankingState {
  // Ensure books are sorted by score (highest first)
  const sortedBooks = [...existingBooks].sort((a, b) => b.score - a.score);
  
  return {
    books: sortedBooks,
    comparisonState: null,
  };
}

/**
 * Get default score based on rating category
 */
export function getDefaultScoreForRating(rating: 'liked' | 'fine' | 'disliked'): number {
  switch (rating) {
    case 'liked':
      return 10.0; // Max score for liked books
    case 'fine':
      return 6.0;
    case 'disliked':
      return 4.0;
  }
}

/**
 * Start the binary search process for inserting a new book
 * Returns the initial comparison state
 */
export function startInsertion(
  rankingState: RankingState,
  newBook: Omit<RankedBook, 'score'>,
  defaultScore: number
): RankingState {
  const { books } = rankingState;
  
  // If list is empty, add book with default score for this rating category
  if (books.length === 0) {
    const newRankedBook: RankedBook = {
      ...newBook,
      score: defaultScore,
    };
    
    return {
      books: [newRankedBook],
      comparisonState: {
        bookA: null,
        bookB: null,
        left: 0,
        right: 0,
        middle: 0,
        isComplete: true,
        finalPosition: 0,
        finalScore: defaultScore,
      },
    };
  }
  
  // Initialize binary search
  // We're searching for where to insert the new book
  // left and right represent indices in the sorted array (highest score first)
  const left = 0;
  const right = books.length - 1;
  const middle = Math.floor((left + right) / 2);
  
  return {
    books,
    comparisonState: {
      bookA: {
        ...newBook,
        score: 0, // Temporary, will be calculated
      },
      bookB: books[middle],
      left,
      right,
      middle,
      isComplete: false,
      finalPosition: null,
      finalScore: null,
    },
  };
}

/**
 * Process user's choice in the binary search
 * Returns updated ranking state with next comparison or final result
 */
export function processComparison(
  rankingState: RankingState,
  userPrefersNewBook: boolean // true if user prefers new book over the comparison book
): RankingState {
  const { books, comparisonState } = rankingState;
  
  if (!comparisonState || comparisonState.isComplete) {
    return rankingState;
  }
  
  const { left, right, middle } = comparisonState;
  const newBook = comparisonState.bookA!;
  
  // Binary search logic
  if (userPrefersNewBook) {
    // New book is better than middle book
    // Search in the top half (left to middle-1)
    // Since array is sorted highest first, "better" means lower index
    if (middle === 0) {
      // New book is better than the best book
      // Insert at position 0 with score = topBook.score + 0.1
      const topScore = books[0].score;
      const finalScore = topScore + 0.1;
      
      return insertBookAtPosition(rankingState, newBook, 0, finalScore);
    }
    
    const newRight = middle - 1;
    if (left > newRight) {
      // Found position: insert at middle (before the book at middle)
      const finalScore = calculateScore(books, middle, 'before');
      return insertBookAtPosition(rankingState, newBook, middle, finalScore);
    }
    
    const newMiddle = Math.floor((left + newRight) / 2);
    return {
      books,
      comparisonState: {
        ...comparisonState,
        bookB: books[newMiddle],
        right: newRight,
        middle: newMiddle,
      },
    };
  } else {
    // New book is worse than middle book
    // Search in the bottom half (middle+1 to right)
    if (middle === books.length - 1) {
      // New book is worse than the worst book
      // Insert at the end with score = bottomBook.score - 0.1
      const bottomScore = books[books.length - 1].score;
      const finalScore = bottomScore - 0.1;
      
      return insertBookAtPosition(rankingState, newBook, books.length, finalScore);
    }
    
    const newLeft = middle + 1;
    if (newLeft > right) {
      // Found position: insert at middle+1 (after the book at middle)
      const finalScore = calculateScore(books, middle, 'after');
      return insertBookAtPosition(rankingState, newBook, middle + 1, finalScore);
    }
    
    const newMiddle = Math.floor((newLeft + right) / 2);
    return {
      books,
      comparisonState: {
        ...comparisonState,
        bookB: books[newMiddle],
        left: newLeft,
        middle: newMiddle,
      },
    };
  }
}

/**
 * Calculate score for a book based on its insertion position
 */
function calculateScore(
  books: RankedBook[],
  referenceIndex: number,
  position: 'before' | 'after'
): number {
  if (position === 'before') {
    // Inserting before referenceIndex
    if (referenceIndex === 0) {
      // Inserting at top
      return books[0].score + 0.1;
    }
    // Average of book above and book at referenceIndex
    const scoreAbove = books[referenceIndex - 1].score;
    const scoreBelow = books[referenceIndex].score;
    return (scoreAbove + scoreBelow) / 2;
  } else {
    // Inserting after referenceIndex
    if (referenceIndex === books.length - 1) {
      // Inserting at bottom
      return books[books.length - 1].score - 0.1;
    }
    // Average of book at referenceIndex and book below
    const scoreAbove = books[referenceIndex].score;
    const scoreBelow = books[referenceIndex + 1].score;
    return (scoreAbove + scoreBelow) / 2;
  }
}

/**
 * Insert book at the specified position with the calculated score
 */
function insertBookAtPosition(
  rankingState: RankingState,
  newBook: Omit<RankedBook, 'score'>,
  position: number,
  score: number
): RankingState {
  const { books } = rankingState;
  const rankedBook: RankedBook = {
    ...newBook,
    score,
  };
  
  // Insert at position
  const newBooks = [...books];
  newBooks.splice(position, 0, rankedBook);
  
  return {
    books: newBooks,
    comparisonState: {
      bookA: null,
      bookB: null,
      left: position,
      right: position,
      middle: position,
      isComplete: true,
      finalPosition: position,
      finalScore: score,
    },
  };
}

/**
 * Get the current books that should be compared
 * Returns null if comparison is complete
 */
export function getCurrentComparison(
  rankingState: RankingState
): { bookA: RankedBook; bookB: RankedBook } | null {
  const { comparisonState } = rankingState;
  
  if (!comparisonState || comparisonState.isComplete) {
    return null;
  }
  
  if (!comparisonState.bookA || !comparisonState.bookB) {
    return null;
  }
  
  return {
    bookA: comparisonState.bookA,
    bookB: comparisonState.bookB,
  };
}

/**
 * Check if the ranking process is complete
 */
export function isRankingComplete(rankingState: RankingState): boolean {
  return rankingState.comparisonState?.isComplete ?? false;
}

/**
 * Get the final result after ranking is complete
 */
export function getFinalResult(rankingState: RankingState): {
  books: RankedBook[];
  insertedBook: RankedBook;
  position: number;
  score: number;
} | null {
  const { books, comparisonState } = rankingState;
  
  if (!comparisonState || !comparisonState.isComplete) {
    return null;
  }
  
  if (comparisonState.finalPosition === null || comparisonState.finalScore === null) {
    return null;
  }
  
  const insertedBook = books[comparisonState.finalPosition];
  
  return {
    books,
    insertedBook,
    position: comparisonState.finalPosition,
    score: comparisonState.finalScore,
  };
}
