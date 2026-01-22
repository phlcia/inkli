import { supabase } from '../config/supabase';
import { Book } from './books';

export interface Recommendation {
  book_id: string;
  book: Book | null;
  reasoning: string;
  score: number;
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
  success?: boolean;
}

/**
 * Generate recommendations for the current user
 * @returns Array of recommendations or error
 */
export async function generateRecommendations(): Promise<{
  data: Recommendation[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('recommendations-generate', {
      method: 'POST',
    });

    if (error) {
      console.error('Error generating recommendations:', error);
      return {
        data: null,
        error: new Error(error.message || 'Failed to generate recommendations'),
      };
    }

    if (!data?.recommendations) {
      return {
        data: null,
        error: new Error('Invalid response from recommendations-generate'),
      };
    }

    return { data: data.recommendations as Recommendation[], error: null };
  } catch (error) {
    console.error('Exception generating recommendations:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}

/**
 * Refresh recommendations (regenerates and resets counter)
 * @returns Array of recommendations or error
 */
export async function refreshRecommendations(): Promise<{
  data: Recommendation[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('recommendations-refresh', {
      method: 'POST',
    });

    if (error) {
      console.error('Error refreshing recommendations:', error);
      return {
        data: null,
        error: new Error(error.message || 'Failed to refresh recommendations'),
      };
    }

    if (!data?.success || !data?.recommendations) {
      const errorMessage = data?.error || 'Invalid response from recommendations-refresh';
      return {
        data: null,
        error: new Error(errorMessage),
      };
    }

    return { data: data.recommendations as Recommendation[], error: null };
  } catch (error) {
    console.error('Exception refreshing recommendations:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}
