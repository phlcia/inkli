import { supabase } from '../config/supabase';

/**
 * Analytics service for tracking filter usage
 * MVP: Only 2 event types (filter_applied, filter_cleared)
 */

export type ShelfContext = 'want_to_read' | 'currently_reading' | 'read' | 'all';

/**
 * Track when a filter is applied
 * Called automatically via debounce when filters change (300ms delay)
 */
export async function trackFilterApplied(
  selectedGenres: string[],
  selectedCustomLabels: string[],
  shelfContext: ShelfContext,
  resultCount: number,
  userId: string
): Promise<void> {
  try {
    await supabase
      .from('filter_events')
      .insert({
        user_id: userId,
        event_type: 'filter_applied',
        selected_genres: selectedGenres,
        selected_custom_labels: selectedCustomLabels,
        shelf_context: shelfContext,
        result_count: resultCount,
      });
  } catch (error) {
    // Fail silently - don't break filtering if analytics fails
    console.error('Failed to track filter_applied event:', error);
  }
}

/**
 * Track when filters are cleared
 * Called immediately when "Clear Filters" button is clicked
 */
export async function trackFilterCleared(
  shelfContext: ShelfContext,
  userId: string
): Promise<void> {
  try {
    await supabase
      .from('filter_events')
      .insert({
        user_id: userId,
        event_type: 'filter_cleared',
        selected_genres: [],
        selected_custom_labels: [],
        shelf_context: shelfContext,
        result_count: null,
      });
  } catch (error) {
    // Fail silently - don't break filtering if analytics fails
    console.error('Failed to track filter_cleared event:', error);
  }
}
