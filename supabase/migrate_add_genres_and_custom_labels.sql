-- Migration: Add genres and custom_labels fields for book filtering
-- Run this migration to add genre mapping and user-specific custom labels

-- Add genres field to books table (mapped preset genres)
ALTER TABLE books ADD COLUMN IF NOT EXISTS genres TEXT[] DEFAULT '{}';

-- Keep categories field as-is for original API genres
-- Add custom_labels to user_books (per-user tags)
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS custom_labels TEXT[] DEFAULT '{}';

-- Add indexes for filtering performance
CREATE INDEX IF NOT EXISTS idx_books_genres ON books USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_user_books_custom_labels ON user_books USING GIN(custom_labels);
CREATE INDEX IF NOT EXISTS idx_user_books_status_genres ON user_books(user_id, status);
