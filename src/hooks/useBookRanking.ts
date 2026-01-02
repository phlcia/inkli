import { useState, useCallback } from 'react';
import {
  RankingState,
  RankedBook,
  initializeRanking,
  startInsertion,
  processComparison,
  getCurrentComparison as getCurrentComparisonUtil,
  isRankingComplete,
  getFinalResult,
} from '../utils/bookRanking';

/**
 * React hook for managing binary search-based book ranking
 * 
 * Usage:
 *   const ranking = useBookRanking(existingBooks);
 *   
 *   // Start inserting a new book
 *   ranking.startInserting(newBook);
 *   
 *   // Get current comparison
 *   const comparison = ranking.getCurrentComparison();
 *   // comparison.bookA is the new book, comparison.bookB is the existing book
 *   
 *   // When user makes a choice
 *   ranking.chooseNewBook(); // or ranking.chooseExistingBook();
 *   
 *   // Check if complete
 *   if (ranking.isComplete()) {
 *     const result = ranking.getResult();
 *     // result.books contains the updated list
 *     // result.insertedBook is the newly inserted book
 *   }
 */
export function useBookRanking(initialBooks: RankedBook[] = []) {
  const [rankingState, setRankingState] = useState<RankingState>(() =>
    initializeRanking(initialBooks)
  );

  /**
   * Start the insertion process for a new book
   */
  const startInserting = useCallback(
    (newBook: Omit<RankedBook, 'score'>, tier: 'liked' | 'fine' | 'disliked') => {
      setRankingState((state) => startInsertion(state, newBook, tier));
    },
    []
  );

  /**
   * Process user's choice: user prefers the new book
   */
  const chooseNewBook = useCallback(() => {
    setRankingState((state) => processComparison(state, true));
  }, []);

  /**
   * Process user's choice: user prefers the existing book
   */
  const chooseExistingBook = useCallback(() => {
    setRankingState((state) => processComparison(state, false));
  }, []);

  /**
   * Get the current comparison pair
   * Returns null if no comparison is active or if ranking is complete
   */
  const getCurrentComparison = useCallback(() => {
    // Use functional form to ensure we get the latest state
    return getCurrentComparisonUtil(rankingState);
  }, [rankingState]);

  /**
   * Check if the ranking process is complete
   */
  const isComplete = useCallback(() => {
    return isRankingComplete(rankingState);
  }, [rankingState]);

  /**
   * Get the final result after ranking is complete
   * Returns null if ranking is not complete
   */
  const getResult = useCallback(() => {
    return getFinalResult(rankingState);
  }, [rankingState]);

  /**
   * Get the current ranked books list
   */
  const getBooks = useCallback(() => {
    return rankingState.books;
  }, [rankingState]);

  /**
   * Reset the ranking state with new books
   */
  const reset = useCallback((books: RankedBook[] = []) => {
    setRankingState(initializeRanking(books));
  }, []);

  return {
    startInserting,
    chooseNewBook,
    chooseExistingBook,
    getCurrentComparison,
    isComplete,
    getResult,
    getBooks,
    reset,
  };
}
