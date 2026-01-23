import { supabase } from '../config/supabase';

export interface Comparison {
  id: string;
  user_id: string;
  winner_book_id: string;
  loser_book_id: string;
  is_onboarding: boolean;
  created_at: string;
}

export interface CreateComparisonParams {
  winner_book_id: string;
  loser_book_id: string;
  is_onboarding?: boolean;
}

/**
 * Create a book comparison (head-to-head ranking)
 * @param params - Comparison parameters
 * @returns Created comparison or error
 */
export async function createComparison(
  params: CreateComparisonParams
): Promise<{ data: Comparison | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('comparisons-create', {
      body: {
        winner_book_id: params.winner_book_id,
        loser_book_id: params.loser_book_id,
        is_onboarding: params.is_onboarding || false,
      },
    });

    if (error) {
      const context = (error as any)?.context;
      const responseBody = context?.body;
      const responseStatus = context?.status;
      const responseStatusText = context?.statusText;
      console.error('Error creating comparison:', {
        message: error.message,
        status: responseStatus,
        statusText: responseStatusText,
        body: responseBody,
      });
      return { data: null, error: new Error(error.message || 'Failed to create comparison') };
    }

    if (!data?.success || !data?.comparison) {
      const errorMessage = data?.error || 'Unknown error from Edge Function';
      return { data: null, error: new Error(errorMessage) };
    }

    return { data: data.comparison as Comparison, error: null };
  } catch (error) {
    console.error('Exception creating comparison:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}

/**
 * Get user's comparison history
 * @param userId - User ID
 * @param options - Query options
 * @returns Array of comparisons
 */
export async function getUserComparisons(
  userId: string,
  options?: {
    is_onboarding?: boolean;
    limit?: number;
  }
): Promise<{ data: Comparison[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('comparisons')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.is_onboarding !== undefined) {
      query = query.eq('is_onboarding', options.is_onboarding);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching comparisons:', error);
      return { data: null, error: new Error(error.message || 'Failed to fetch comparisons') };
    }

    return { data: data as Comparison[], error: null };
  } catch (error) {
    console.error('Exception fetching comparisons:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}
