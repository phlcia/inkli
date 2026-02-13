import { supabase } from '../config/supabase';

export async function submitBookFeedback(params: {
  bookId: string;
  issueType: string;
  description?: string;
}): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('book-feedback', {
      method: 'POST',
      body: params,
    });

    if (error) {
      console.error('Error submitting book feedback:', error);
      return { success: false, error: new Error(error.message || 'Failed to submit feedback') };
    }

    if (!data?.success) {
      const errorMessage = data?.error || 'Unknown error from Edge Function';
      return { success: false, error: new Error(errorMessage) };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception submitting book feedback:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}
