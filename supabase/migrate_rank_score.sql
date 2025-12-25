-- Migration: Replace rank_index with rank_score
-- This implements a score-based ranking system within rating categories

-- Add rank_score column
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS rank_score NUMERIC DEFAULT NULL;

-- Remove rank_index column if it exists
ALTER TABLE user_books DROP COLUMN IF EXISTS rank_index;

-- Create index for rank_score queries
CREATE INDEX IF NOT EXISTS idx_user_books_rank_score ON user_books(user_id, rating, rank_score);

-- Update existing books with default scores based on rating
UPDATE user_books 
SET rank_score = CASE 
  WHEN rating = 'liked' THEN 10.0
  WHEN rating = 'fine' THEN 6.0
  WHEN rating = 'disliked' THEN 4.0
  ELSE NULL
END
WHERE rank_score IS NULL AND rating IS NOT NULL;
