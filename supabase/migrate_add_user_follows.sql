-- Migration: Create user_follows table
-- Run this migration to enable follow/follower functionality

CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id) -- Prevent users from following themselves
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following_id ON user_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower_following ON user_follows(follower_id, following_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read follows (public read for member search)
CREATE POLICY "Anyone can view follows"
  ON user_follows
  FOR SELECT
  USING (true);

-- Policy: Authenticated users can insert their own follows
CREATE POLICY "Users can insert own follows"
  ON user_follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Policy: Users can delete their own follows
CREATE POLICY "Users can delete own follows"
  ON user_follows
  FOR DELETE
  USING (auth.uid() = follower_id);

