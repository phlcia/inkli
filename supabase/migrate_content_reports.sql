-- Migration: content_reports table and RLS for moderation
-- Reporters can only insert/read their own reports. reviewed_by is for admin (Supabase auth user).

CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  target_type TEXT NOT NULL CHECK (target_type IN (
    'user', 'comment', 'user_book'
  )),
  target_id UUID NOT NULL,

  reason TEXT NOT NULL CHECK (reason IN (
    'spam', 'harassment', 'hate_speech', 'inappropriate_content',
    'misinformation', 'underage_user', 'other'
  )),
  details TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS content_reports_status_created
  ON content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS content_reports_target
  ON content_reports(target_type, target_id);

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own reports"
  ON content_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Users can read own reports"
  ON content_reports FOR SELECT
  USING (reporter_id = auth.uid());

-- Optional: is_admin on user_profiles for future admin edge function
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
