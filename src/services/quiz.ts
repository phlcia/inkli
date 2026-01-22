import { supabase } from '../config/supabase';
import { Book } from './books';

export interface QuizBookPair {
  book1: Book;
  book2: Book;
}

/**
 * Get a random pair of books from the starter set for the quiz
 * Excludes pairs the user has already compared
 * @returns Book pair or error
 */
export async function getQuizBookPair(): Promise<{ data: QuizBookPair | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('quiz-start', {
      method: 'GET',
    });

    if (error) {
      console.error('Error getting quiz book pair:', error);
      return { data: null, error: new Error(error.message || 'Failed to get quiz book pair') };
    }

    if (!data?.book1 || !data?.book2) {
      return { data: null, error: new Error('Invalid response from quiz-start') };
    }

    return { data: data as QuizBookPair, error: null };
  } catch (error) {
    console.error('Exception getting quiz book pair:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}

/**
 * Skip the onboarding quiz
 * Marks user as skipped_onboarding_quiz = true
 * @returns Success or error
 */
export async function skipQuiz(): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('quiz-skip', {
      method: 'POST',
    });

    if (error) {
      console.error('Error skipping quiz:', error);
      return { success: false, error: new Error(error.message || 'Failed to skip quiz') };
    }

    if (!data?.success) {
      const errorMessage = data?.error || 'Unknown error from Edge Function';
      return { success: false, error: new Error(errorMessage) };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception skipping quiz:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}
