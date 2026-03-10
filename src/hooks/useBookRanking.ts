import { useState, useCallback } from 'react';
import {
  RankingState,
  RankedBook,
  initializeRanking,
  startInsertion,
  processComparison,
  skipToBottom as skipToBottomUtil,
  getCurrentComparison as getCurrentComparisonUtil,
  isRankingComplete,
  getFinalResult,
} from '../utils/bookRanking';

const HISTORY_MAX = 20;

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
  const [history, setHistory] = useState<RankingState[]>([]);

  /**
   * Start the insertion process for a new book
   */
  const startInserting = useCallback(
    (newBook: Omit<RankedBook, 'score' | 'tier'>, tier: 'liked' | 'fine' | 'disliked') => {
      setHistory([]);
      setRankingState((state) => startInsertion(state, newBook, tier));
    },
    []
  );

  /**
   * Push entire current rankingState to history (max HISTORY_MAX), then apply fn
   */
  const pushAndApply = useCallback(
    (fn: (state: RankingState) => RankingState) => {
      setRankingState((prev) => {
        setHistory((h) => {
          const next = [...h, prev];
          return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
        });
        return fn(prev);
      });
    },
    []
  );

  /**
   * Process user's choice: user prefers the new book
   */
  const chooseNewBook = useCallback(() => {
    pushAndApply((state) => processComparison(state, true));
  }, [pushAndApply]);

  /**
   * Process user's choice: user prefers the existing book
   */
  const chooseExistingBook = useCallback(() => {
    pushAndApply((state) => processComparison(state, false));
  }, [pushAndApply]);

  /**
   * Skip comparison and place new book at bottom of tier
   */
  const skipToBottom = useCallback(() => {
    pushAndApply((state) => skipToBottomUtil(state));
  }, [pushAndApply]);

  /**
   * Undo the last comparison or skip; restores the previous ranking state
   */
  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      if (!restored) {
        return prev;
      }
      setRankingState(restored);
      return prev.slice(0, -1);
    });
  }, []);

  const canUndo = history.length > 0;

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
    setHistory([]);
    setRankingState(initializeRanking(books));
  }, []);

  return {
    startInserting,
    chooseNewBook,
    chooseExistingBook,
    skipToBottom,
    undo,
    canUndo,
    getCurrentComparison,
    isComplete,
    getResult,
    getBooks,
    reset,
  };
}
