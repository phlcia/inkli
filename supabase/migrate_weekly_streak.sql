-- Migration: Weekly Streak Feature
-- This migration adds weekly streak tracking based on book interactions
-- Run this in your Supabase SQL Editor

-- Part 1: Add weekly_streak column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weekly_streak integer DEFAULT 0;

-- Part 2: Function to calculate weekly streak for a user
-- A week is defined as Monday-Sunday (ISO week)
-- Streak counts consecutive weeks with at least one interaction (INSERT or UPDATE on user_books)
CREATE OR REPLACE FUNCTION calculate_weekly_streak(user_uuid uuid)
RETURNS integer AS $$
DECLARE
  interaction_weeks integer[];
  current_week integer;
  current_year integer;
  week_key integer;
  streak_count integer := 0;
  week_record record;
BEGIN
  -- Get current week number (ISO week)
  current_week := EXTRACT(WEEK FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Get all distinct weeks where user had interactions
  -- Interactions are: created_at (INSERT) or updated_at (UPDATE) on user_books
  -- Format: year * 100 + week_number for easy sorting
  SELECT ARRAY_AGG(DISTINCT weeks.week_key ORDER BY weeks.week_key DESC)
  INTO interaction_weeks
  FROM (
    -- Get weeks from created_at (book additions)
    SELECT 
      (EXTRACT(YEAR FROM created_at)::integer * 100 + EXTRACT(WEEK FROM created_at)::integer) as week_key
    FROM user_books
    WHERE user_id = user_uuid
    
    UNION
    
    -- Get weeks from updated_at (book updates)
    SELECT 
      (EXTRACT(YEAR FROM updated_at)::integer * 100 + EXTRACT(WEEK FROM updated_at)::integer) as week_key
    FROM user_books
    WHERE user_id = user_uuid
  ) weeks;
  
  -- If no interactions, streak is 0
  IF interaction_weeks IS NULL OR array_length(interaction_weeks, 1) IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Calculate current week key
  week_key := current_year * 100 + current_week;
  
  -- Check if current week has interaction
  IF NOT (week_key = ANY(interaction_weeks)) THEN
    -- No interaction this week, streak is 0
    RETURN 0;
  END IF;
  
  -- Count consecutive weeks starting from current week
  streak_count := 1;
  
  -- Go backwards week by week
  LOOP
    week_key := week_key - 1;
    
    -- Handle year rollover (when week goes below 1)
    IF week_key % 100 < 1 THEN
      -- Move to last week of previous year
      -- Approximate to week 52 (most years have 52 weeks, some have 53)
      -- This is close enough for streak calculation
      week_key := ((week_key / 100) - 1) * 100 + 52;
    END IF;
    
    -- Check if this week has interaction
    IF week_key = ANY(interaction_weeks) THEN
      streak_count := streak_count + 1;
    ELSE
      -- Gap found, streak breaks
      EXIT;
    END IF;
    
    -- Safety limit: don't go back more than 2 years (104 weeks)
    IF streak_count > 104 THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql;

-- Part 3: Function to update weekly streak for a user
CREATE OR REPLACE FUNCTION update_weekly_streak(user_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET weekly_streak = calculate_weekly_streak(user_uuid)
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Part 4: Trigger function to update streak when user_books changes
CREATE OR REPLACE FUNCTION trigger_update_weekly_streak()
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
  
  -- Update weekly streak for this user
  PERFORM update_weekly_streak(affected_user_id);
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Part 5: Create trigger on user_books table
DROP TRIGGER IF EXISTS update_weekly_streak_trigger ON user_books;
CREATE TRIGGER update_weekly_streak_trigger
AFTER INSERT OR UPDATE OR DELETE ON user_books
FOR EACH ROW
EXECUTE FUNCTION trigger_update_weekly_streak();

-- Part 6: Function to backfill streaks for all users
CREATE OR REPLACE FUNCTION backfill_all_weekly_streaks()
RETURNS void AS $$
DECLARE
  user_record record;
BEGIN
  FOR user_record IN SELECT user_id FROM user_profiles
  LOOP
    PERFORM update_weekly_streak(user_record.user_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Part 7: Backfill existing users (run once)
SELECT backfill_all_weekly_streaks();

-- Part 8: Add index for better performance (if needed)
CREATE INDEX IF NOT EXISTS idx_user_books_created_at ON user_books(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_books_updated_at ON user_books(user_id, updated_at);

