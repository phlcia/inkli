-- Schedule push-receipts edge function every 5 minutes (Expo receipts need a short delay after send).
-- Requires: pg_cron, pg_net (extensions schema). Replace YOUR_PROJECT_REF with your Supabase project ref.
-- One-time: set service role key so the cron can auth to the edge function:
--   ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';

SELECT cron.schedule(
  'push-receipts-every-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://xmsjvvogdqfxvxmctyex.supabase.co/functions/v1/push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  )$$
);
