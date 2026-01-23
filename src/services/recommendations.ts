import { supabase } from '../config/supabase';
import { Book } from './books';

export interface Recommendation {
  id: string;
  book_id: string;
  book: Book | null;
  reasoning: string;
  score: number;
  algorithm_version?: string | null;
  created_at?: string;
  shown_at?: string | null;
  clicked_at?: string | null;
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
  success?: boolean;
}

interface RecommendationRow {
  id: string;
  book_id: string;
  score: number;
  reason: string | null;
  algorithm_version: string | null;
  created_at: string;
  shown_at: string | null;
  clicked_at: string | null;
  book: Book | null;
}

function normalizeRecommendations(raw: any[]): Recommendation[] {
  return (raw || []).map((rec) => ({
    id: rec.id,
    book_id: rec.book_id,
    book: rec.book || null,
    reasoning: rec.reasoning ?? rec.reason ?? 'Recommended for you',
    score: rec.score ?? 0,
    algorithm_version: rec.algorithm_version ?? null,
    created_at: rec.created_at,
    shown_at: rec.shown_at ?? null,
    clicked_at: rec.clicked_at ?? null,
  }));
}

/**
 * Fetch stored recommendations for a user
 */
export async function fetchRecommendations(userId: string): Promise<{
  data: Recommendation[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('recommendations')
      .select(
        `
        id,
        book_id,
        score,
        reason,
        algorithm_version,
        created_at,
        shown_at,
        clicked_at,
        book:books (
          id,
          title,
          authors,
          cover_url
        )
      `
      )
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching recommendations:', error);
      return {
        data: null,
        error: new Error(error.message || 'Failed to fetch recommendations'),
      };
    }

    return { data: normalizeRecommendations((data || []) as RecommendationRow[]), error: null };
  } catch (error) {
    console.error('Exception fetching recommendations:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}

export async function markRecommendationsShown(recommendationIds: string[]): Promise<{
  error: Error | null;
}> {
  if (recommendationIds.length === 0) {
    return { error: null };
  }

  try {
    const { error } = await supabase
      .from('recommendations')
      .update({ shown_at: new Date().toISOString() })
      .in('id', recommendationIds)
      .is('shown_at', null);

    if (error) {
      console.error('Error updating shown_at:', error);
      return {
        error: new Error(error.message || 'Failed to update shown_at'),
      };
    }

    return { error: null };
  } catch (error) {
    console.error('Exception updating shown_at:', error);
    return {
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}

export async function markRecommendationClicked(recommendationId: string): Promise<{
  error: Error | null;
}> {
  try {
    const { error } = await supabase
      .from('recommendations')
      .update({ clicked_at: new Date().toISOString() })
      .eq('id', recommendationId);

    if (error) {
      console.error('Error updating clicked_at:', error);
      return {
        error: new Error(error.message || 'Failed to update clicked_at'),
      };
    }

    return { error: null };
  } catch (error) {
    console.error('Exception updating clicked_at:', error);
    return {
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
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

    return { data: normalizeRecommendations(data.recommendations), error: null };
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

    return { data: normalizeRecommendations(data.recommendations), error: null };
  } catch (error) {
    console.error('Exception refreshing recommendations:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}
