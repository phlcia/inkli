import { supabase } from '../config/supabase';
import { refreshRecommendations } from './recommendations';

const COMPARISONS_REFRESH_THRESHOLD = 10;
const DAYS_REFRESH_THRESHOLD = 7;

type TriggerAction = 'comparison' | 'shelf_add' | 'rating_change';

function daysSince(dateString: string): number {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export async function checkAndTriggerRecommendations(userId: string): Promise<{
  triggered: boolean;
  error?: Error;
}> {
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('rankings_since_last_refresh, last_refresh_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error loading recommendation trigger profile:', error);
      return { triggered: false, error: new Error(error.message) };
    }

    const rankingsSinceLastRefresh = profile?.rankings_since_last_refresh ?? 0;
    const lastRefreshAt = profile?.last_refresh_at;

    const shouldRegenerate =
      rankingsSinceLastRefresh >= COMPARISONS_REFRESH_THRESHOLD ||
      !lastRefreshAt ||
      daysSince(lastRefreshAt) >= DAYS_REFRESH_THRESHOLD;

    if (!shouldRegenerate) {
      return { triggered: false };
    }

    const { error: refreshError } = await refreshRecommendations();
    if (refreshError) {
      console.error('Error auto-refreshing recommendations:', refreshError);
      return { triggered: false, error: refreshError };
    }

    return { triggered: true };
  } catch (error) {
    console.error('Exception checking recommendation triggers:', error);
    return {
      triggered: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}

export async function onUserAction(userId: string, action: TriggerAction): Promise<void> {
  if (!userId) return;

  try {
    if (action !== 'comparison') {
      const { error } = await supabase.rpc('increment_rankings_counter', {
        user_id: userId,
      });
      if (error) {
        console.error('Error incrementing rankings counter:', error);
      }
    }
  } catch (error) {
    console.error('Exception incrementing rankings counter:', error);
  }

  await checkAndTriggerRecommendations(userId);
}
