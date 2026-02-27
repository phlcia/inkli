-- Migration: Per-share invite links with 24h expiry
-- New table: invite_links
-- New pg_cron jobs: delete expired unused links hourly, delete old redeemed links daily

-- 1. Per-share invite links table
CREATE TABLE IF NOT EXISTS invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  accepted_by UUID REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invite_links_inviter ON invite_links(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_code ON invite_links(code);

ALTER TABLE invite_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invite links" ON invite_links;
CREATE POLICY "Users can view own invite links"
  ON invite_links
  FOR SELECT
  USING (
    (SELECT auth.uid()) = inviter_user_id
    OR (SELECT auth.uid()) = accepted_by
  );

-- 2. pg_cron jobs for invite_links cleanup
SELECT cron.schedule(
  'delete-expired-invite-links',
  '0 * * * *',
  $$DELETE FROM invite_links WHERE expires_at < NOW() AND accepted_by IS NULL$$
);

SELECT cron.schedule(
  'archive-old-redeemed-invite-links',
  '0 3 * * *',
  $$DELETE FROM invite_links
    WHERE accepted_at < NOW() - INTERVAL '90 days'
      AND accepted_by IS NOT NULL$$
);

