-- Migration: Fixed Real-time User Ranking System
-- This fixes the counting logic and trigger conditions

-- Part 1: Columns already exist from previous migration
-- ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS books_read_count integer DEFAULT 0;
-- ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS global_rank integer;
-- etc.

-- FIXED: Function to update books_read_count for a user
-- Now counts books with status='read' instead of rank_score IS NOT NULL
CREATE OR REPLACE FUNCTION update_user_books_count(user_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET books_read_count = (
    SELECT COUNT(*)
    FROM user_books
    WHERE user_id = user_uuid
    AND status = 'read'  -- FIX: Count read books, not ranked books
  )
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- FIXED: Simplified rank update - always recalculate all ranks
-- The "optimization" was causing bugs where ranks wouldn't update properly
CREATE OR REPLACE FUNCTION update_all_ranks()
RETURNS void AS $$
BEGIN
  -- Recalculate ranks for ALL users with books > 0
  WITH ranked_users AS (
    SELECT 
      user_id,
      books_read_count,
      ROW_NUMBER() OVER (ORDER BY books_read_count DESC, created_at ASC, user_id ASC) as new_rank
    FROM user_profiles
    WHERE books_read_count > 0
  )
  UPDATE user_profiles
  SET global_rank = ranked_users.new_rank
  FROM ranked_users
  WHERE user_profiles.user_id = ranked_users.user_id;
  
  -- Set rank to NULL for users with 0 books
  UPDATE user_profiles
  SET global_rank = NULL
  WHERE books_read_count = 0;
END;
$$ LANGUAGE plpgsql;

-- FIXED: Trigger function that runs on EVERY user_books change
-- Removed the optimization that was causing bugs
CREATE OR REPLACE FUNCTION trigger_update_user_rank()
RETURNS TRIGGER AS $$
DECLARE
  affected_user_id uuid;
  old_user_id uuid;
BEGIN
  -- Determine which user(s) were affected
  IF TG_OP = 'DELETE' THEN
    affected_user_id := OLD.user_id;
    old_user_id := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    affected_user_id := NEW.user_id;
    old_user_id := OLD.user_id;
    
    -- If user_id changed (shouldn't happen, but handle it), update both
    IF NEW.user_id != OLD.user_id THEN
      PERFORM update_user_books_count(OLD.user_id);
    END IF;
  ELSE -- INSERT
    affected_user_id := NEW.user_id;
  END IF;
  
  -- Update books_read_count for affected user(s)
  PERFORM update_user_books_count(affected_user_id);
  
  -- Recalculate ALL ranks (simpler and more reliable)
  PERFORM update_all_ranks();
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- FIXED: Create trigger on user_books table
-- Now fires on ANY change, not just specific columns
DROP TRIGGER IF EXISTS update_user_rank_trigger ON user_books;
CREATE TRIGGER update_user_rank_trigger
AFTER INSERT OR UPDATE OR DELETE ON user_books
FOR EACH ROW
EXECUTE FUNCTION trigger_update_user_rank();

-- Keep the manual recalculation function (unchanged, but fix counting logic)
CREATE OR REPLACE FUNCTION recalculate_all_ranks()
RETURNS void AS $$
BEGIN
  -- Update all books_read_counts first
  UPDATE user_profiles
  SET books_read_count = (
    SELECT COUNT(*)
    FROM user_books
    WHERE user_id = user_profiles.user_id
    AND status = 'read'  -- FIX: Count read books
  )
  WHERE user_profiles.user_id IS NOT NULL;
  
  -- Then recalculate all ranks
  WITH ranked_users AS (
    SELECT 
      user_id,
      books_read_count,
      ROW_NUMBER() OVER (ORDER BY books_read_count DESC, created_at ASC, user_id ASC) as rank
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
$$ LANGUAGE plpgsql
SET search_path = public, pg_catalog;

-- Backfill: Run full recalculation to fix existing data
SELECT recalculate_all_ranks();

-- Indexes already exist from previous migration
-- CREATE INDEX IF NOT EXISTS idx_user_profiles_books_read_count ON user_profiles(books_read_count DESC);
-- CREATE INDEX IF NOT EXISTS idx_user_profiles_global_rank ON user_profiles(global_rank) WHERE global_rank IS NOT NULL;

-- Diagnostic query to check if everything is working:
-- Run this after the migration to verify counts and ranks are correct
SELECT 
  up.username,
  up.books_read_count,
  up.global_rank,
  (SELECT COUNT(*) FROM user_books WHERE user_id = up.user_id AND status = 'read') as actual_read_count,
  (SELECT COUNT(*) FROM user_books WHERE user_id = up.user_id AND rank_score IS NOT NULL) as actual_ranked_count
FROM user_profiles up
WHERE up.books_read_count > 0
ORDER BY up.global_rank
LIMIT 20;

-- If books_read_count != actual_read_count for anyone, run:
-- SELECT recalculate_all_ranks();
