/**
 * Tier-Based Binary Search Book Ranking System
 * 
 * This module implements a binary search algorithm for ranking books within
 * tier categories (disliked/fine/liked). After insertion, it redistributes
 * all scores in the tier to maintain even spacing and prevent boundary violations.
 */

export type BookTier = 'disliked' | 'fine' | 'liked';

export interface RankedBook {
  id: string;
  title: string;
  authors?: string[];
  cover_url?: string | null;
  tier: BookTier;
  score: number;
}

export interface RankingState {
  books: RankedBook[];
  comparisonState: ComparisonState | null;
}

/**
 * Tier score boundaries
 * disliked: [0, 3.5]
 * fine: (3.5, 6.5]
 * liked: (6.5, 10.0]
 */
const TIER_BOUNDARIES = {
  disliked: { min: 0, max: 3.5 },
  fine: { min: 3.5, max: 6.5 },
  liked: { min: 6.5, max: 10.0 },
} as const;

/**
 * Round score to 3 decimal places
 */
function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

/**
 * Get books in a specific tier, sorted by score (highest first)
 */
function getBooksInTier(books: RankedBook[], tier: BookTier): RankedBook[] {
  return books.filter(book => book.tier === tier);
}

/**
 * Initialize ranking state with existing books
 * Books should be sorted by score (highest first)
 */
export function initializeRanking(existingBooks: RankedBook[]): RankingState {
  const sortedBooks = [...existingBooks].sort((a, b) => b.score - a.score);
  return {
    books: sortedBooks,
    comparisonState: null,
  };
}

/**
 * Start the binary search process for inserting a new book
 * Returns the initial comparison state
 */
export function startInsertion(
  rankingState: RankingState,
  newBook: Omit<RankedBook, 'score'>,
  tier: BookTier
): RankingState {
  const { books } = rankingState;
  const tierBooks = getBooksInTier(books, tier);
  
  // If tier is empty, add book at max score for this tier
  if (tierBooks.length === 0) {
    const maxScore = TIER_BOUNDARIES[tier].max;
    const newRankedBook: RankedBook = {
      ...newBook,
      tier,
      score: roundScore(maxScore),
    };
    
    const allBooks = [...books, newRankedBook].sort((a, b) => b.score - a.score);
    
    return {
      books: allBooks,
      comparisonState: {
        // Keep reference to the inserted book so getFinalResult can find it
        bookA: newRankedBook,
        bookB: null,
        left: 0,
        right: 0,
        middle: 0,
        isComplete: true,
        finalPosition: 0,
        needsRedistribution: false,
      },
    };
  }
  
  // Initialize binary search within this tier
  const left = 0;
  const right = tierBooks.length - 1;
  const middle = Math.floor((left + right) / 2);
  
  return {
    books,
    comparisonState: {
      bookA: {
        ...newBook,
        tier,
        score: 0, // Temporary, will be calculated
      },
      bookB: tierBooks[middle],
      left,
      right,
      middle,
      isComplete: false,
      finalPosition: null,
      needsRedistribution: false,
    },
  };
}

/**
 * Calculate score for a book based on its insertion position
 */
function calculateScore(
  tierBooks: RankedBook[],
  referenceIndex: number,
  position: 'before' | 'after',
  tier: BookTier
): number {
  const { min, max } = TIER_BOUNDARIES[tier];
  
  if (position === 'before') {
    if (referenceIndex === 0) {
      // Inserting at top
      return Math.min(tierBooks[0].score + 0.1, max);
    }
    // Midpoint between book above and book at referenceIndex
    const upperScore = tierBooks[referenceIndex - 1].score;
    const lowerScore = tierBooks[referenceIndex].score;
    return (upperScore + lowerScore) / 2;
  } else {
    if (referenceIndex === tierBooks.length - 1) {
      // Inserting at bottom
      const lastScore = tierBooks[referenceIndex].score;
      return Math.max(lastScore - 0.1, min + 0.001);
    }
    // Midpoint between book at referenceIndex and book below
    const upperScore = tierBooks[referenceIndex].score;
    const lowerScore = tierBooks[referenceIndex + 1].score;
    return (upperScore + lowerScore) / 2;
  }
}

/**
 * Check if redistribution is needed
 */
function shouldRedistribute(
  tierBooks: RankedBook[],
  position: number
): boolean {
  // Periodic: redistribute every 10th book (after insertion)
  if ((tierBooks.length + 1) % 10 === 0) return true;
  
  // Gap check: if inserting between books, check gap
  if (position > 0 && position < tierBooks.length) {
    const gap = Math.abs(tierBooks[position - 1].score - tierBooks[position].score);
    return gap < 0.01;
  }
  
  return false;
}

/**
 * Insert book at the specified position with the calculated score
 */
function insertBookAtPosition(
  rankingState: RankingState,
  newBook: Omit<RankedBook, 'score'> & { tier: BookTier },
  position: number,
  score: number
): RankingState {
  const { books } = rankingState;
  const tierBooks = getBooksInTier(books, newBook.tier);
  
  const rankedBook: RankedBook = { ...newBook, score: roundScore(score) };
  
  // Insert into tier books
  const updatedTierBooks = [...tierBooks];
  updatedTierBooks.splice(position, 0, rankedBook);
  
  // Merge with other tiers and sort
  const otherTierBooks = books.filter(b => b.tier !== newBook.tier);
  const allBooks = [...otherTierBooks, ...updatedTierBooks].sort((a, b) => b.score - a.score);
  
  return {
    books: allBooks,
    comparisonState: {
      // Preserve the inserted book (with its computed score) for getFinalResult
      bookA: rankedBook,
      bookB: null,
      left: position,
      right: position,
      middle: position,
      isComplete: true,
      finalPosition: position,
      needsRedistribution: false, // Fast path - no redistribution
    },
  };
}

/**
 * Redistribute scores evenly across a tier's books
 * Maintains the order but spaces scores evenly between min and max
 */
function redistributeTierScores(
  tierBooks: RankedBook[],
  tier: BookTier
): RankedBook[] {
  if (tierBooks.length === 0) return [];
  
  const { min, max } = TIER_BOUNDARIES[tier];
  const n = tierBooks.length;
  
  if (n === 1) {
    return [{ ...tierBooks[0], score: roundScore(max) }];
  }
  
  const range = max - min;
  
  // Distribute as: range*(n)/n + min, range*(n-1)/n + min, ..., range*1/n + min
  return tierBooks.map((book, index) => ({
    ...book,
    score: roundScore(range * (n - index) / n + min),
  }));
}

/**
 * Insert book at position within its tier and redistribute all tier scores
 */
function insertBookInTierWithRedistribution(
  rankingState: RankingState,
  newBook: Omit<RankedBook, 'score'> & { tier: BookTier },
  position: number
): RankingState {
  const { books } = rankingState;
  const tierBooks = getBooksInTier(books, newBook.tier);
  
  // Insert new book at position
  const updatedTierBooks = [...tierBooks];
  updatedTierBooks.splice(position, 0, {
    ...newBook,
    score: 0, // Temporary, will be redistributed
  });
  
  // Redistribute all scores
  const redistributed = redistributeTierScores(updatedTierBooks, newBook.tier);
  const insertedBook = redistributed[position];
  
  // Update all books
  const otherTierBooks = books.filter(b => b.tier !== newBook.tier);
  const allBooks = [...otherTierBooks, ...redistributed].sort((a, b) => b.score - a.score);
  
  return {
    books: allBooks,
    comparisonState: {
      // Keep the inserted book with its redistributed score
      bookA: insertedBook,
      bookB: null,
      left: position,
      right: position,
      middle: position,
      isComplete: true,
      finalPosition: position,
      needsRedistribution: true, // Set flag to indicate redistribution happened
    },
  };
}

/**
 * Process user's choice in the binary search
 * Returns updated ranking state with next comparison or final result
 */
export function processComparison(
  rankingState: RankingState,
  userPrefersNewBook: boolean
): RankingState {
  const { books, comparisonState } = rankingState;
  
  if (!comparisonState || comparisonState.isComplete) {
    return rankingState;
  }
  
  const { left, right, middle } = comparisonState;
  const newBook = comparisonState.bookA!;
  const tierBooks = getBooksInTier(books, newBook.tier);
  const { min, max } = TIER_BOUNDARIES[newBook.tier];
  
  let position: number;
  
  // Binary search logic to find insertion position
  if (userPrefersNewBook) {
    if (middle === 0) {
      position = 0;
    } else {
      const newRight = middle - 1;
      if (left > newRight) {
        position = middle;
      } else {
        const newMiddle = Math.floor((left + newRight) / 2);
        return {
          books,
          comparisonState: {
            ...comparisonState,
            bookB: tierBooks[newMiddle],
            right: newRight,
            middle: newMiddle,
          },
        };
      }
    }
  } else {
    if (middle === tierBooks.length - 1) {
      position = tierBooks.length;
    } else {
      const newLeft = middle + 1;
      if (newLeft > right) {
        position = middle + 1;
      } else {
        const newMiddle = Math.floor((newLeft + right) / 2);
        return {
          books,
          comparisonState: {
            ...comparisonState,
            bookB: tierBooks[newMiddle],
            left: newLeft,
            middle: newMiddle,
          },
        };
      }
    }
  }
  
  // NEW CODE - Add boundary collision checks
  // If we're inserting at the very top and the current top is already near/at max,
  // force redistribution to avoid duplicate scores at the boundary.
  if (position === 0 && tierBooks.length > 0) {
    const topBookScore = tierBooks[0].score;
    if (topBookScore >= max - 0.1) {
      return insertBookInTierWithRedistribution(rankingState, newBook, position);
    }
  }
  // Likewise, if inserting at the bottom when the bottom book is at/near min,
  // redistribute to keep spacing without collisions.
  if (position === tierBooks.length && tierBooks.length > 0) {
    const bottomBookScore = tierBooks[tierBooks.length - 1].score;
    if (bottomBookScore <= min + 0.1) {
      return insertBookInTierWithRedistribution(rankingState, newBook, position);
    }
  }
  
  // Check if redistribution needed
  const needsRedistribution = shouldRedistribute(tierBooks, position);
  
  if (needsRedistribution) {
    return insertBookInTierWithRedistribution(rankingState, newBook, position);
  } else {
    // FAST PATH: Calculate midpoint score
    let positionType: 'before' | 'after';
    let refIndex: number;
    
    if (position === 0) {
      positionType = 'before';
      refIndex = 0;
    } else if (position === tierBooks.length) {
      positionType = 'after';
      refIndex = tierBooks.length - 1;
    } else {
      positionType = 'before';
      refIndex = position;
    }
    
    const score = calculateScore(tierBooks, refIndex, positionType, newBook.tier);
    
    // CRITICAL: Check if score would violate boundaries
    if (score > max || score < min) {
      // Force redistribution to stay in bounds
      return insertBookInTierWithRedistribution(rankingState, newBook, position);
    }
    
    return insertBookAtPosition(rankingState, newBook, position, score);
  }
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
  positionInTier: number;
  score: number;
  updatedTierBooks?: RankedBook[];
} | null {
  const { books, comparisonState } = rankingState;
  
  if (!comparisonState || !comparisonState.isComplete) {
    return null;
  }
  
  if (comparisonState.finalPosition === null) {
    return null;
  }
  
  const bookA = comparisonState.bookA;
  if (!bookA) return null;
  
  const insertedBook = books.find(
    b => b.id === bookA.id && b.tier === bookA.tier
  );
  
  if (!insertedBook) return null;
  
  const tierBooks = getBooksInTier(books, insertedBook.tier);
  
  const result: {
    books: RankedBook[];
    insertedBook: RankedBook;
    positionInTier: number;
    score: number;
    updatedTierBooks?: RankedBook[];
  } = {
    books,
    insertedBook,
    positionInTier: comparisonState.finalPosition,
    score: insertedBook.score,
  };
  
  // Use flag to determine if redistribution happened
  if (comparisonState.needsRedistribution) {
    result.updatedTierBooks = tierBooks;
  }
  
  return result;
}
