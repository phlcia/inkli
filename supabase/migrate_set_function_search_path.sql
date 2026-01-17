-- Set explicit search_path for functions to avoid SECURITY DEFINER search_path issues
-- Generated from supabase/schema.sql

ALTER FUNCTION backfill_all_weekly_streaks() SET search_path = public, pg_catalog;
ALTER FUNCTION calculate_weekly_streak(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION emit_activity_card_from_user_books() SET search_path = public, pg_catalog;
ALTER FUNCTION get_followed_activity_cards(uuid, integer, timestamptz, uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION get_followed_user_books_activity(uuid, integer, timestamptz, uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_activity_comment() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_activity_like() SET search_path = public, pg_catalog;
ALTER FUNCTION notify_follow() SET search_path = public, pg_catalog;
ALTER FUNCTION recalculate_all_ranks() SET search_path = public, pg_catalog;
ALTER FUNCTION trigger_update_book_stats() SET search_path = public, pg_catalog;
ALTER FUNCTION trigger_update_user_rank() SET search_path = public, pg_catalog;
ALTER FUNCTION trigger_update_weekly_streak() SET search_path = public, pg_catalog;
ALTER FUNCTION update_all_ranks() SET search_path = public, pg_catalog;
ALTER FUNCTION update_book_stats(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION update_comment_likes_count() SET search_path = public, pg_catalog;
ALTER FUNCTION update_comment_timestamp() SET search_path = public, pg_catalog;
ALTER FUNCTION update_comments_count() SET search_path = public, pg_catalog;
ALTER FUNCTION update_likes_count() SET search_path = public, pg_catalog;
ALTER FUNCTION update_ranks_around_user(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION update_updated_at_column() SET search_path = public, pg_catalog;
ALTER FUNCTION update_user_book_details_no_touch(uuid, boolean, text, boolean, text) SET search_path = public, pg_catalog;
ALTER FUNCTION update_user_book_rank_scores_no_touch(uuid, jsonb) SET search_path = public, pg_catalog;
ALTER FUNCTION update_user_book_status_no_touch(uuid, text, boolean) SET search_path = public, pg_catalog;
ALTER FUNCTION update_user_books_count(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION update_weekly_streak(uuid) SET search_path = public, pg_catalog;
