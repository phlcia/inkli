import { supabase } from '../config/supabase';

/**
 * Generic product analytics (funnel, activation). Inserts into `analytics_events`.
 * Fails silently so callers never block UX.
 */
export async function trackEvent(
  userId: string,
  eventName: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from('analytics_events').insert({
      user_id: userId,
      event_name: eventName,
      properties: properties ?? {},
    });
    if (error) {
      console.error(`Failed to track "${eventName}":`, error);
    }
  } catch (err) {
    console.error(`Failed to track "${eventName}":`, err);
  }
}

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

export type CustomLabelDeleteContext = 'filter_panel' | 'book_editor';

/**
 * Track when a custom label is deleted
 * Called when user long-presses to delete a custom shelf
 */
export async function trackCustomLabelDeleted(
  label: string,
  booksAffected: number,
  context: CustomLabelDeleteContext,
  userId: string
): Promise<void> {
  try {
    await supabase.from('filter_events').insert({
      user_id: userId,
      event_type: 'custom_label_deleted',
      event_data: {
        label,
        books_affected: booksAffected,
        context,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Fail silently - don't break deletion if analytics fails
    console.error('Failed to track custom_label_deleted event:', error);
  }
}
