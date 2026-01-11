-- Diagnostic and Fix Script for User Ranking System
-- Run this in your Supabase SQL Editor to check and fix ranking issues

-- ============================================================================
-- PART 1: DIAGNOSTIC - Check current state
-- ============================================================================

-- Check if required columns exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'books_read_count'
  ) THEN
    RAISE NOTICE '❌ Missing books_read_count column - migration not run!';
  ELSE
    RAISE NOTICE '✅ books_read_count column exists';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'global_rank'
  ) THEN
    RAISE NOTICE '❌ Missing global_rank column - migration not run!';
  ELSE
    RAISE NOTICE '✅ global_rank column exists';
  END IF;
END $$;

-- Check if trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_user_rank_trigger'
  ) THEN
    RAISE NOTICE '❌ Ranking trigger not found - migration not run!';
  ELSE
    RAISE NOTICE '✅ Ranking trigger exists';
  END IF;
END $$;

-- Check if functions exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'recalculate_all_ranks'
  ) THEN
    RAISE NOTICE '❌ recalculate_all_ranks function not found - migration not run!';
  ELSE
    RAISE NOTICE '✅ recalculate_all_ranks function exists';
  END IF;
END $$;

-- Show current user statistics
SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE books_read_count > 0) as users_with_books,
  COUNT(*) FILTER (WHERE global_rank IS NOT NULL) as users_with_rank,
  MAX(books_read_count) as max_books_read,
  AVG(books_read_count)::INTEGER as avg_books_read
FROM user_profiles;

-- Show users with books but no rank (this is the problem!)
SELECT 
  user_id,
  username,
  books_read_count,
  global_rank,
  (SELECT COUNT(*) FROM user_books WHERE user_id = user_profiles.user_id AND status = 'read') as actual_read_count
FROM user_profiles
WHERE books_read_count > 0 
  AND global_rank IS NULL
ORDER BY books_read_count DESC
LIMIT 10;

-- ============================================================================
-- PART 2: FIX - Run this if issues are found
-- ============================================================================

-- If columns are missing, run the full migration first:
-- Copy and run the contents of migrate_user_ranking.sql

-- If columns exist but ranks are null, run this to recalculate:
-- SELECT recalculate_all_ranks();

-- ============================================================================
-- PART 3: VERIFY - Check if fix worked
-- ============================================================================

-- After running recalculate_all_ranks(), verify:
SELECT 
  user_id,
  username,
  books_read_count,
  global_rank,
  (SELECT COUNT(*) FROM user_books WHERE user_id = user_profiles.user_id AND status = 'read') as actual_read_count
FROM user_profiles
WHERE books_read_count > 0
ORDER BY global_rank ASC
LIMIT 20;


