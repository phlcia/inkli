-- Migration: Track when a user last viewed notifications

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notifications_last_seen_at TIMESTAMPTZ;
