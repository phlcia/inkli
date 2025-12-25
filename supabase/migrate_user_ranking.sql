-- Migration: Real-time User Ranking System
-- This migration adds ranking functionality that updates automatically on every book change
-- Run this in your Supabase SQL Editor

-- Part 1: Add rank columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS books_read_count integer DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS global_rank integer;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS member_since TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Update member_since for existing users (if not set)
UPDATE user_profiles
SET member_since = created_at
WHERE member_since IS NULL;

-- Function to update books_read_count for a user
CREATE OR REPLACE FUNCTION update_user_books_count(user_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET books_read_count = (
    SELECT COUNT(*)
    FROM user_books
    WHERE user_id = user_uuid
    AND status = 'read'
  )
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- OPTIMIZED: Only recalculate ranks for affected users and their neighbors
CREATE OR REPLACE FUNCTION update_ranks_around_user(user_uuid uuid)
RETURNS void AS $$
DECLARE
  user_count integer;
BEGIN
  -- Get the updated count for this user
  SELECT books_read_count INTO user_count
  FROM user_profiles
  WHERE user_id = user_uuid;
  
  -- Recalculate ranks for users with counts near this user's count
  -- This is much more efficient than recalculating ALL users
  WITH ranked_users AS (
    SELECT 
      user_id,
      books_read_count,
      DENSE_RANK() OVER (ORDER BY books_read_count DESC, created_at ASC) as new_rank
    FROM user_profiles
    WHERE books_read_count >= GREATEST(0, user_count - 10)
      AND books_read_count <= user_count + 10
      AND books_read_count > 0
  )
  UPDATE user_profiles
  SET global_rank = ranked_users.new_rank
  FROM ranked_users
  WHERE user_profiles.user_id = ranked_users.user_id;
  
  -- If this affects top ranks, recalculate more broadly
  IF user_count >= (SELECT MAX(books_read_count) - 5 FROM user_profiles) THEN
    WITH all_ranked AS (
      SELECT 
        user_id,
        books_read_count,
        DENSE_RANK() OVER (ORDER BY books_read_count DESC, created_at ASC) as new_rank
      FROM user_profiles
      WHERE books_read_count > 0
    )
    UPDATE user_profiles
    SET global_rank = all_ranked.new_rank
    FROM all_ranked
    WHERE user_profiles.user_id = all_ranked.user_id;
  END IF;
  
  -- Set rank to NULL for users with 0 books
  UPDATE user_profiles
  SET global_rank = NULL
  WHERE books_read_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Trigger function that runs on EVERY user_books change
CREATE OR REPLACE FUNCTION trigger_update_user_rank()
RETURNS TRIGGER AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  -- Determine which user was affected
  IF TG_OP = 'DELETE' THEN
    affected_user_id := OLD.user_id;
  ELSE
    affected_user_id := NEW.user_id;
  END IF;
  
  -- Update books_read_count for this user
  PERFORM update_user_books_count(affected_user_id);
  
  -- Recalculate ranks around this user
  PERFORM update_ranks_around_user(affected_user_id);
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_books table - fires on EVERY change
DROP TRIGGER IF EXISTS update_user_rank_trigger ON user_books;
CREATE TRIGGER update_user_rank_trigger
AFTER INSERT OR UPDATE OF status OR DELETE ON user_books
FOR EACH ROW
EXECUTE FUNCTION trigger_update_user_rank();

-- Also create a function to do full recalculation (for maintenance/backfill)
CREATE OR REPLACE FUNCTION recalculate_all_ranks()
RETURNS void AS $$
BEGIN
  -- Update all books_read_counts first
  UPDATE user_profiles
  SET books_read_count = (
    SELECT COUNT(*)
    FROM user_books
    WHERE user_id = user_profiles.user_id
    AND status = 'read'
  );
  
  -- Then recalculate all ranks
  WITH ranked_users AS (
    SELECT 
      user_id,
      books_read_count,
      DENSE_RANK() OVER (ORDER BY books_read_count DESC, created_at ASC) as rank
    FROM user_profiles
    WHERE books_read_count > 0
  )
  UPDATE user_profiles
  SET global_rank = ranked_users.rank
  FROM ranked_users
  WHERE user_profiles.user_id = ranked_users.user_id;
  
  -- Set rank to NULL for users with 0 books
  UPDATE user_profiles
  SET global_rank = NULL
  WHERE books_read_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Part 2: Backfill existing users (run once)
-- Initialize counts and ranks for all existing users
SELECT recalculate_all_ranks();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_books_read_count ON user_profiles(books_read_count DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_global_rank ON user_profiles(global_rank) WHERE global_rank IS NOT NULL;

-- RLS Policy: Allow authenticated users to read public profile data for leaderboard
-- This allows users to see username, books_read_count, global_rank, and profile_photo_url
-- of other users (needed for leaderboard functionality)
DROP POLICY IF EXISTS "Users can view public profile data" ON user_profiles;
CREATE POLICY "Users can view public profile data"
  ON user_profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

