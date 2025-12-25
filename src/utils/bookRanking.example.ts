/**
 * Example usage of the binary search-based book ranking system
 * 
 * This file demonstrates how to use the ranking algorithm in your UI components.
 */

import { useBookRanking, RankedBook } from '../hooks/useBookRanking';

/**
 * Example: Using the hook in a React component
 */
export function ExampleComponent() {
  // Initialize with existing ranked books (or empty array)
  const existingBooks: RankedBook[] = [
    { id: '1', title: 'Book A', score: 10.0 },
    { id: '2', title: 'Book B', score: 8.0 },
    { id: '3', title: 'Book C', score: 6.0 },
  ];

  const ranking = useBookRanking(existingBooks);

  // Start inserting a new book
  const handleAddBook = (newBook: Omit<RankedBook, 'score'>) => {
    ranking.startInserting(newBook);
  };

  // In your render/UI:
  const comparison = ranking.getCurrentComparison();
  
  if (comparison) {
    // Show comparison UI:
    // - comparison.bookA is the new book being inserted
    // - comparison.bookB is the existing book to compare against
    // 
    // When user clicks "This" (prefers new book):
    //   ranking.chooseNewBook();
    //
    // When user clicks "That" (prefers existing book):
    //   ranking.chooseExistingBook();
    //
    // After each choice, check again:
    //   const nextComparison = ranking.getCurrentComparison();
    //   if (!nextComparison && ranking.isComplete()) {
    //     const result = ranking.getResult();
    //     // result.books contains the updated ranked list
    //     // result.insertedBook is the newly inserted book
    //     // result.position is where it was inserted
    //     // result.score is the calculated score
    //   }
  }

  return null; // Your UI here
}

/**
 * Example: Direct usage of the utility functions (without React)
 */
import {
  initializeRanking,
  startInsertion,
  processComparison,
  getCurrentComparison,
  isRankingComplete,
  getFinalResult,
} from './bookRanking';

export function exampleDirectUsage() {
  // 1. Initialize with existing books
  const existingBooks: RankedBook[] = [
    { id: '1', title: 'Book A', score: 10.0 },
    { id: '2', title: 'Book B', score: 8.0 },
  ];
  
  let state = initializeRanking(existingBooks);

  // 2. Start inserting a new book
  const newBook = { id: '3', title: 'Book C', authors: ['Author'] };
  state = startInsertion(state, newBook);

  // 3. Show comparison to user and get their choice
  let comparison = getCurrentComparison(state);
  
  while (comparison && !isRankingComplete(state)) {
    // In your UI, show:
    // - comparison.bookA (the new book)
    // - comparison.bookB (the existing book)
    // 
    // Wait for user to choose "This" or "That"
    // For this example, let's say user prefers the new book:
    const userPrefersNewBook = true; // This would come from your UI
    
    // Process the choice
    state = processComparison(state, userPrefersNewBook);
    
    // Get next comparison (if any)
    comparison = getCurrentComparison(state);
  }

  // 4. Ranking is complete, get the result
  if (isRankingComplete(state)) {
    const result = getFinalResult(state);
    if (result) {
      console.log('Final ranked books:', result.books);
      console.log('Inserted book:', result.insertedBook);
      console.log('Position:', result.position);
      console.log('Score:', result.score);
    }
  }
}

/**
 * Example: Complete flow with multiple comparisons
 * 
 * This shows how the binary search minimizes comparisons:
 * - With 1 book: 0 comparisons (empty list)
 * - With 2 books: 1 comparison
 * - With 4 books: 2 comparisons
 * - With 8 books: 3 comparisons
 * - With n books: ~log2(n) comparisons
 */
export function exampleCompleteFlow() {
  // Start with empty list
  let state = initializeRanking([]);
  
  // Add first book (no comparisons needed)
  state = startInsertion(state, { id: '1', title: 'First Book' });
  console.log('First book added with score 10.0');
  
  // Add second book (1 comparison)
  state = startInsertion(state, { id: '2', title: 'Second Book' });
  let comparison = getCurrentComparison(state);
  // User compares: prefers Second Book
  state = processComparison(state, true);
  const result1 = getFinalResult(state);
  console.log('Second book inserted at position', result1?.position, 'with score', result1?.score);
  
  // Add third book (1-2 comparisons)
  state = initializeRanking(result1!.books);
  state = startInsertion(state, { id: '3', title: 'Third Book' });
  comparison = getCurrentComparison(state);
  // User compares: prefers Third Book over middle book
  state = processComparison(state, true);
  comparison = getCurrentComparison(state);
  if (comparison) {
    // Another comparison needed
    // User prefers Third Book again
    state = processComparison(state, true);
  }
  const result2 = getFinalResult(state);
  console.log('Third book inserted at position', result2?.position, 'with score', result2?.score);
}
