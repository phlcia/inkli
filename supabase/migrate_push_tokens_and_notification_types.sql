-- Push notification infrastructure and notification type extensions
-- 1. push_tokens table for Expo push token registration
-- 2. push_send_tickets table to store ticket IDs for delayed receipt polling
-- 3. notifications: actor_id nullable, new types (recommendations_ready, reading_nudge)

-- push_tokens: one row per device token per user
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  device_id TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_expo_token ON push_tokens(expo_push_token);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own push tokens" ON push_tokens;
CREATE POLICY "Users can manage own push tokens"
  ON push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- push_send_tickets: store Expo ticket IDs so push-receipts can poll getReceipts after delay
CREATE TABLE IF NOT EXISTS push_send_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  push_token_id UUID NOT NULL REFERENCES push_tokens(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_send_tickets_created_at ON push_send_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_push_send_tickets_push_token_id ON push_send_tickets(push_token_id);

ALTER TABLE push_send_tickets ENABLE ROW LEVEL SECURITY;

-- Only service role / edge functions need to insert and read (for receipt polling)
DROP POLICY IF EXISTS "Service role can manage push_send_tickets" ON push_send_tickets;
CREATE POLICY "Service role can manage push_send_tickets"
  ON push_send_tickets
  FOR ALL
  USING (false)
  WITH CHECK (false);
-- RLS blocks anon/auth; edge functions use service role which bypasses RLS when configured
-- If your project uses RLS for service role, add a policy that allows service role.
-- For typical Supabase: service role bypasses RLS, so no read policy needed for edge.

-- Notifications: allow nullable actor_id and new types
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS fk_notifications_actor;

ALTER TABLE notifications
  ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_actor
  FOREIGN KEY (actor_id)
  REFERENCES user_profiles(user_id)
  ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'follow', 'follow_request', 'follow_accept', 'follow_reject',
    'invite_accepted', 'recommendations_ready', 'reading_nudge'
  ));

-- Policy for insert: users can only create notifications where they are the actor (system notifications with actor_id NULL are inserted by edge/cron via service role)
DROP POLICY IF EXISTS "Users can create notifications as actor" ON notifications;
CREATE POLICY "Users can create notifications as actor"
  ON notifications
  FOR INSERT
  WITH CHECK ((select auth.uid()) = actor_id);

-- Reading nudge: one notification per user per week when they have currently_reading and no progress on any in 7+ days
CREATE OR REPLACE FUNCTION insert_reading_nudge_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ub_id UUID;
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '7 days';
BEGIN
  FOR r IN
    SELECT u.id AS user_id
    FROM auth.users u
    WHERE EXISTS (
      SELECT 1 FROM user_books ub
      WHERE ub.user_id = u.id
        AND ub.status = 'currently_reading'
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_books ub
      WHERE ub.user_id = u.id
        AND ub.status = 'currently_reading'
        AND ub.last_progress_update IS NOT NULL
        AND ub.last_progress_update >= cutoff
    )
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.recipient_id = u.id
        AND n.type = 'reading_nudge'
        AND n.created_at >= NOW() - INTERVAL '7 days'
    )
  LOOP
    SELECT id INTO ub_id
    FROM user_books
    WHERE user_id = r.user_id
      AND status = 'currently_reading'
    ORDER BY last_progress_update ASC NULLS FIRST
    LIMIT 1;
    IF ub_id IS NOT NULL THEN
      INSERT INTO notifications (recipient_id, actor_id, type, user_book_id, created_at)
      VALUES (r.user_id, NULL, 'reading_nudge', ub_id, NOW());
    END IF;
  END LOOP;
END;
$$;

-- Schedule daily at 10:00 UTC (adjust as needed). Requires pg_cron extension.
SELECT cron.schedule('reading-nudge-daily', '0 10 * * *', $$SELECT insert_reading_nudge_notifications()$$);
