-- Weekly refresh of user_profiles.weekly_streak so idle users show 0 without touching user_books.
-- Requires: pg_cron extension enabled (Database → Extensions in Supabase).
-- Schedule: Monday 00:05 UTC (start of ISO week in UTC-oriented setups).

SELECT cron.schedule(
  'weekly-streak-refresh',
  '5 0 * * 1',
  $$SELECT public.backfill_all_weekly_streaks()$$
);
