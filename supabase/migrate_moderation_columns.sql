-- Migration: Moderation schema additions (columns only; RLS in separate step)
-- Run after report-content edge function is tested.

ALTER TABLE activity_comments
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'clear'
    CHECK (moderation_status IN ('clear', 'flagged', 'suspended', 'banned'));

ALTER TABLE user_books
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ DEFAULT NULL;
