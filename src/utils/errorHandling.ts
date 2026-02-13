/**
 * Three-tier error handling utilities.
 * Classifies errors as offline/network, server (5xx), or client (4xx).
 */

export type ErrorTier = 'offline' | 'server' | 'client';

/** Supabase FunctionsHttpError has context.status for HTTP status codes */
interface SupabaseFunctionsError {
  context?: { status?: number; statusText?: string; body?: unknown };
  message?: string;
  name?: string;
}

/** Check if we're offline (call before making requests) */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined' || navigator === null) return false;
  return !navigator.onLine;
}

/** Check if error message indicates network/offline failure */
function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('connection') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound')
  );
}

/** Extract HTTP status from Supabase edge function error */
function getFunctionsErrorStatus(error: unknown): number | null {
  const e = error as SupabaseFunctionsError;
  const status = e?.context?.status;
  return typeof status === 'number' ? status : null;
}

/** Classify error into offline, server (5xx), or client (4xx) */
export function classifyError(error: unknown): ErrorTier {
  if (isOffline()) return 'offline';

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (isNetworkErrorMessage(message)) return 'offline';

  // Supabase FunctionsHttpError / FunctionsRelayError / FunctionsFetchError
  const status = getFunctionsErrorStatus(error);

  if (status !== null) {
    if (status >= 500) return 'server';
    if (status >= 400) return 'client';
  }

  // Supabase PostgrestError - use code hints
  const code = (error as { code?: string })?.code;
  if (code) {
    // PGRST = PostgREST errors; 5xx-like internal errors
    if (code.startsWith('PGRST') && code !== 'PGRST116') return 'server';
    // 23505 uniqueness, 23503 FK = client
    if (code === '23505' || code === '23503' || code === '42501') return 'client';
  }

  // Default: treat unknown as server (retry might help)
  return 'server';
}

/** Get user-facing message per tier and optional context */
export function getErrorMessage(
  error: unknown,
  tier: ErrorTier,
  context?: string
): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');

  switch (tier) {
    case 'offline':
      return "You're offline - changes will sync when you reconnect";

    case 'server':
      return 'Something went wrong - try again?';

    case 'client':
      if (context) {
        const contextual: Record<string, string> = {
          'save bookmark': "Couldn't save bookmark",
          'remove bookmark': "Couldn't remove bookmark",
          'save notes': "Couldn't save your notes. Please try again.",
          'save dates': "Couldn't save dates. Please try again.",
          'update dates': "Couldn't update dates. Please try again.",
          'delete dates': "Couldn't delete dates. Please try again.",
          'save tags': "Couldn't save tags. Please try again.",
          'remove genre': "Couldn't remove genre. Please try again.",
          'remove label': "Couldn't remove label. Please try again.",
          'load feed': "Couldn't load feed",
          'load profile': "Couldn't load profile",
          'load book': "Couldn't load book details",
          'load leaderboard': "Couldn't load leaderboard",
          'load search': "Couldn't search",
          'load shelf': "Couldn't load shelf",
          'save shelf': "Couldn't save shelf",
          'update privacy': "Couldn't update privacy settings",
          'accept follow request': "Couldn't accept follow request",
          'reject follow request': "Couldn't reject follow request",
          'unblock user': "Couldn't unblock user",
          'unmute user': "Couldn't unmute user",
          'sign out': "Couldn't sign out",
          'delete shelf': "Couldn't delete shelf",
          'remove from shelf': "Couldn't remove book from shelf",
          'add to shelf': "Couldn't add book to shelf",
          'update book': "Couldn't update book",
          'save ranking': "Couldn't save ranking",
          'load ranking': "Couldn't load books for ranking",
          'save comparison': "Couldn't save comparison",
          'load quiz': "Couldn't load quiz",
          'skip quiz': "Couldn't skip quiz",
          'complete quiz': "Couldn't complete quiz",
          'load recommendations': "Couldn't load recommendations",
          'generate recommendations': "Couldn't generate recommendations",
        };
        const key = context.toLowerCase();
        if (contextual[key]) return contextual[key];
      }
      return rawMessage || "Couldn't complete that action";
  }
}
