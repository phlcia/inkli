-- Fix function search_path warnings and tighten unmapped_genres_log insert policy

-- Explicit search_path for newly flagged functions
ALTER FUNCTION set_user_books_last_progress_update() SET search_path = public, pg_catalog;
ALTER FUNCTION update_book_comparison_stats() SET search_path = public, pg_catalog;
ALTER FUNCTION update_follow_requests_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_follow_request() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_follow_request_update() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_follow() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_activity_like() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_activity_comment() SET search_path = public, pg_catalog;
ALTER FUNCTION get_followed_activity_cards(uuid, integer, timestamptz, uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION get_followed_user_books_activity(uuid, integer, timestamptz, uuid) SET search_path = public, pg_catalog;

-- Remove overly permissive insert policy; allow authenticated inserts only
DROP POLICY IF EXISTS "Anyone can insert unmapped genre logs" ON public.unmapped_genres_log;
DROP POLICY IF EXISTS "Authenticated users can insert unmapped genre logs" ON public.unmapped_genres_log;
CREATE POLICY "Authenticated users can insert unmapped genre logs"
  ON public.unmapped_genres_log
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');

-- Ensure search_path is set for any remove_custom_label overloads if present
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'remove_custom_label'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_catalog;',
      fn.schema_name,
      fn.function_name,
      fn.args
    );
  END LOOP;
END $$;
