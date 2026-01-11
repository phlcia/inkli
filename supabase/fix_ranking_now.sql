-- Quick Fix: Recalculate All Ranks
-- Run this in your Supabase SQL Editor to fix missing ranks
-- This will recalculate ranks for all users based on their current books_read_count

-- First, make sure the migration has been run
-- If you get an error about recalculate_all_ranks not existing, run migrate_user_ranking.sql first

-- Recalculate all ranks
SELECT recalculate_all_ranks();

-- Verify the fix worked
SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE books_read_count > 0) as users_with_books,
  COUNT(*) FILTER (WHERE global_rank IS NOT NULL) as users_with_rank
FROM user_profiles;

-- Show top 10 users
SELECT 
  global_rank,
  username,
  books_read_count
FROM user_profiles
WHERE global_rank IS NOT NULL
ORDER BY global_rank ASC
LIMIT 10;


