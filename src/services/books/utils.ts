export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1000000) return `${Math.floor(count / 1000)}k`;
  return `${Math.floor(count / 1000000)}M`;
}

/**
 * Format rank score for display (rounds to one decimal place)
 * Helper function to format score for display
 */
export function formatRankScore(score: number | null): string {
  if (score === null || score === undefined) return '--';
  return score.toFixed(1); // Always show one decimal place
}
