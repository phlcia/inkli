import { supabase } from '../config/supabase';

/**
 * Deactivate account - sets deactivated_at timestamp
 * Automatically signs user out after successful deactivation
 */
export async function deactivateAccount(userId: string): Promise<{ error: unknown }> {
  try {
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ deactivated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) return { error: updateError };

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error('Sign out after deactivation failed:', signOutError);
      // Don't return error - deactivation succeeded, sign out is secondary
    }
    return { error: null };
  } catch (error) {
    return { error };
  }
}

/**
 * Delete account permanently - requires password or "DELETE" confirmation
 * Automatically signs user out after successful deletion
 */
export async function deleteAccount(
  _userId: string,
  passwordOrConfirmation: string,
  isOAuthUser: boolean
): Promise<{ error: unknown }> {
  try {
    const body = isOAuthUser
      ? { confirmation: passwordOrConfirmation } // Should be "DELETE"
      : { password: passwordOrConfirmation };

    const { data, error: deleteError } = await supabase.functions.invoke('delete-account', {
      body,
    });

    if (deleteError) {
      let message = deleteError.message;
      const ctx = deleteError as { context?: Response };
      if (ctx.context?.json) {
        try {
          const body = (await ctx.context.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // fallback to deleteError.message
        }
      }
      return { error: new Error(message ?? 'Failed to delete account') };
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error('Sign out after deletion failed:', signOutError);
      // Don't return error - deletion succeeded, sign out is secondary
    }
    return { error: null };
  } catch (error) {
    return { error };
  }
}

/**
 * Change password - requires current password verification
 * Verifies current password via signInWithPassword, then updates to new password
 */
export async function updatePassword(
  userEmail: string,
  currentPassword: string,
  newPassword: string
): Promise<{ error: unknown }> {
  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });
    if (signInError) {
      return { error: new Error('Current password is incorrect') };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  } catch (error) {
    return { error };
  }
}
