-- Migration: Increase rank_score precision to 3 decimal places
-- Changes NUMERIC(4,2) to NUMERIC(6,3) to preserve 3 decimal places

-- Alter the rank_score column to allow higher precision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_books' AND column_name = 'rank_score'
  ) THEN
    ALTER TABLE user_books
      ALTER COLUMN rank_score TYPE NUMERIC(6,3) USING rank_score::NUMERIC(6,3);
  END IF;
END $$;

-- Also update the community_average_score column in books table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'books' AND column_name = 'community_average_score'
  ) THEN
    ALTER TABLE books
      ALTER COLUMN community_average_score TYPE NUMERIC(6,3)
      USING community_average_score::NUMERIC(6,3);
  END IF;
END $$;

-- Update the function that calculates community stats
CREATE OR REPLACE FUNCTION update_book_stats(book_id_param UUID)
RETURNS void AS $$
DECLARE
  avg_score NUMERIC(6,3);
  rank_count INTEGER;
BEGIN
  -- Calculate average rank_score and count distinct users
  -- Only count rows where rank_score IS NOT NULL
  SELECT
    COALESCE(AVG(rank_score), NULL)::NUMERIC(6,3),
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
