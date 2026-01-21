-- Migration: Add user-specific genres to user_books table
-- This allows each user to customize genres for books on their shelf
-- NULL = use book's default genres, empty array = user explicitly cleared genres

-- Add user_genres column to user_books table
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS user_genres TEXT[] DEFAULT NULL;

-- Add index for filtering performance
CREATE INDEX IF NOT EXISTS idx_user_books_user_genres ON user_books USING GIN(user_genres);
