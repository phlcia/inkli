-- SUPERSEDED by migrate_increase_rank_score_precision_3dp.sql
-- Migration: Add community statistics to books table with automatic triggers
-- This implements a hybrid approach where stats are pre-calculated and updated via triggers

-- Add community statistics columns to books table
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS community_average_score DECIMAL(3,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS community_rank_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stats_last_updated TIMESTAMPTZ DEFAULT NULL;

-- Create index for performance on user_books queries
CREATE INDEX IF NOT EXISTS idx_user_books_book_rank_score 
  ON user_books(book_id, rank_score) 
  WHERE rank_score IS NOT NULL;

-- Function to update book community statistics
CREATE OR REPLACE FUNCTION update_book_stats(book_id_param UUID)
RETURNS void AS $$
DECLARE
  avg_score DECIMAL(3,2);
  rank_count INTEGER;
BEGIN
  -- Calculate average rank_score and count distinct users
  -- Only count rows where rank_score IS NOT NULL
  SELECT 
    COALESCE(AVG(rank_score), NULL)::DECIMAL(3,2),
    COUNT(DISTINCT user_id)
  INTO avg_score, rank_count
  FROM user_books
  WHERE book_id = book_id_param
    AND rank_score IS NOT NULL;

  -- Update the books table with calculated stats
  UPDATE books
  SET 
    community_average_score = avg_score,
    community_rank_count = COALESCE(rank_count, 0),
    stats_last_updated = NOW()
  WHERE id = book_id_param;
END;
$$ LANGUAGE plpgsql;

-- Trigger function that handles INSERT, UPDATE, and DELETE
CREATE OR REPLACE FUNCTION trigger_update_book_stats()
RETURNS TRIGGER AS $$
DECLARE
  affected_book_id UUID;
BEGIN
  -- Determine which book_id to update
  IF TG_OP = 'DELETE' THEN
    affected_book_id := OLD.book_id;
  ELSE
    affected_book_id := NEW.book_id;
  END IF;

  -- Only update if rank_score is involved
  -- For INSERT: always update (new ranking)
  -- For UPDATE: only if rank_score changed
  -- For DELETE: always update (ranking removed)
  IF TG_OP = 'INSERT' OR 
     (TG_OP = 'UPDATE' AND (OLD.rank_score IS DISTINCT FROM NEW.rank_score)) OR
     TG_OP = 'DELETE' THEN
    PERFORM update_book_stats(affected_book_id);
  END IF;

  -- Return appropriate row
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_books table
-- Fires AFTER INSERT, UPDATE, or DELETE
-- The trigger function handles filtering based on rank_score changes
DROP TRIGGER IF EXISTS update_book_stats_trigger ON user_books;

CREATE TRIGGER update_book_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_books
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_book_stats();

-- Initialize stats for existing books (optional - can be run separately)
-- This will populate stats for books that already have rankings
-- Uncomment if you want to backfill existing data:
-- DO $$
-- DECLARE
--   book_record RECORD;
-- BEGIN
--   FOR book_record IN SELECT DISTINCT book_id FROM user_books WHERE rank_score IS NOT NULL
--   LOOP
--     PERFORM update_book_stats(book_record.book_id);
--   END LOOP;
-- END $$;
