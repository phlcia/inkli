-- Migration: Add recommendation engine schema
-- This adds tables, columns, indexes, and triggers for the MVP recommendation system

-- 1. Extend books table
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS total_comparisons INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wins INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_win_rate FLOAT,
  ADD COLUMN IF NOT EXISTS is_starter_book BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS starter_set_id INT;

-- 2. Extend user_profiles table
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS total_comparisons INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rankings_since_last_refresh INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_onboarding_quiz BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS skipped_onboarding_quiz BOOLEAN DEFAULT false;

-- 3. Create genres table
CREATE TABLE IF NOT EXISTS genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create book_genres junction table
CREATE TABLE IF NOT EXISTS book_genres (
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (book_id, genre_id)
);

-- 5. Create themes table
CREATE TABLE IF NOT EXISTS themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create book_themes junction table
CREATE TABLE IF NOT EXISTS book_themes (
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (book_id, theme_id)
);

-- 7. Create comparisons table
CREATE TABLE IF NOT EXISTS comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  winner_book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  loser_book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  is_onboarding BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (winner_book_id != loser_book_id)
);

-- 8. Create indexes
-- Unique constraint to prevent duplicate comparisons (handles both orderings)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_comparison 
ON comparisons(
  user_id, 
  LEAST(winner_book_id, loser_book_id), 
  GREATEST(winner_book_id, loser_book_id)
);

-- Other indexes for performance
CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_winner_loser ON comparisons(winner_book_id, loser_book_id);
CREATE INDEX IF NOT EXISTS idx_book_genres_book_genre ON book_genres(book_id, genre_id);
CREATE INDEX IF NOT EXISTS idx_book_themes_book_theme ON book_themes(book_id, theme_id);
CREATE INDEX IF NOT EXISTS idx_books_starter ON books(is_starter_book, starter_set_id);

-- 9. Enable RLS on new tables
ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies for genres (read-only for all)
DROP POLICY IF EXISTS "Anyone can read genres" ON genres;
CREATE POLICY "Anyone can read genres"
  ON genres
  FOR SELECT
  USING (true);

-- 11. RLS Policies for book_genres (read-only for all)
DROP POLICY IF EXISTS "Anyone can read book_genres" ON book_genres;
CREATE POLICY "Anyone can read book_genres"
  ON book_genres
  FOR SELECT
  USING (true);

-- 12. RLS Policies for themes (read-only for all)
DROP POLICY IF EXISTS "Anyone can read themes" ON themes;
CREATE POLICY "Anyone can read themes"
  ON themes
  FOR SELECT
  USING (true);

-- 13. RLS Policies for book_themes (read-only for all)
DROP POLICY IF EXISTS "Anyone can read book_themes" ON book_themes;
CREATE POLICY "Anyone can read book_themes"
  ON book_themes
  FOR SELECT
  USING (true);

-- 14. RLS Policies for comparisons
-- Users can read their own comparisons
DROP POLICY IF EXISTS "Users can read own comparisons" ON comparisons;
CREATE POLICY "Users can read own comparisons"
  ON comparisons
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own comparisons
DROP POLICY IF EXISTS "Users can insert own comparisons" ON comparisons;
CREATE POLICY "Users can insert own comparisons"
  ON comparisons
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Anyone can read comparisons for stats (needed for recommendations)
DROP POLICY IF EXISTS "Anyone can read comparisons for stats" ON comparisons;
CREATE POLICY "Anyone can read comparisons for stats"
  ON comparisons
  FOR SELECT
  USING (true);

-- 15. Create trigger function to update book and user stats
CREATE OR REPLACE FUNCTION update_book_comparison_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update winner stats
    UPDATE books
    SET 
        total_comparisons = total_comparisons + 1,
        total_wins = total_wins + 1,
        global_win_rate = CASE 
            WHEN total_comparisons + 1 > 0 
            THEN (total_wins + 1.0) / (total_comparisons + 1.0)
            ELSE 0.5
        END
    WHERE id = NEW.winner_book_id;
    
    -- Update loser stats
    UPDATE books
    SET 
        total_comparisons = total_comparisons + 1,
        global_win_rate = CASE 
            WHEN total_comparisons + 1 > 0 
            THEN total_wins::FLOAT / (total_comparisons + 1.0)
            ELSE 0.5
        END
    WHERE id = NEW.loser_book_id;
    
    -- Update user stats
    UPDATE user_profiles
    SET 
        total_comparisons = total_comparisons + 1,
        rankings_since_last_refresh = rankings_since_last_refresh + 1
    WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 16. Create trigger
DROP TRIGGER IF EXISTS trigger_update_comparison_stats ON comparisons;
CREATE TRIGGER trigger_update_comparison_stats
AFTER INSERT ON comparisons
FOR EACH ROW
EXECUTE FUNCTION update_book_comparison_stats();
