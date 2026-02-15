import { supabase } from '../config/supabase';
import type { UserPrivateData, UserPrivateDataUpdate } from '../types/database';

/**
 * Get private data (email, phone) for the current user.
 * Auto-heals: if no row exists (e.g. backfill/trigger missed), insert one and retry.
 */
export async function getPrivateData(
  userId: string
): Promise<{ data: UserPrivateData | null; error: unknown }> {
  const { data, error } = await supabase
    .from('user_private_data')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (!data) {
    console.warn('Missing user_private_data, creating...', { userId });
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email ?? '';
    const { error: insertError } = await supabase
      .from('user_private_data')
      .insert({ user_id: userId, email });

    if (insertError) {
      console.error('Auto-heal insert failed:', insertError);
      return { data: null, error: insertError };
    }
    return getPrivateData(userId);
  }

  return { data: data as UserPrivateData, error: null };
}

/**
 * Update private data for the current user. RLS ensures only owner can update.
 */
export async function updatePrivateData(
  userId: string,
  updates: UserPrivateDataUpdate
): Promise<{ data: UserPrivateData | null; error: unknown }> {
  const { data, error } = await supabase
    .from('user_private_data')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return { data: null, error };
  return { data: data as UserPrivateData, error: null };
}
