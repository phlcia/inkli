/**
 * Utility functions for rank score display and colors
 */

/**
 * Get color for a rank score
 * Green for high scores (>=7), yellow for mid (>=5), red for low (<5)
 */
export function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return '#9E9E9E'; // Gray for no score
  }
  if (score > 7) {
    return '#4CAF50'; // Green
  } else if (score > 3.5) {
    return '#FFC107'; // Yellow
  } else {
    return '#F44336'; // Red
  }
}

/**
 * Format score for display (one decimal place)
 * Handles null/undefined values
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'N/A';
  return score.toFixed(1);
}
