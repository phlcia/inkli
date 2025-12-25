-- Migration: Add all Google Books API fields to books table
-- Run this migration to expand the books table with all available fields

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS subtitle TEXT,
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS published_date TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS page_count INTEGER,
  ADD COLUMN IF NOT EXISTS categories TEXT[],
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC,
  ADD COLUMN IF NOT EXISTS ratings_count INTEGER,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS preview_link TEXT,
  ADD COLUMN IF NOT EXISTS info_link TEXT,
  ADD COLUMN IF NOT EXISTS isbn_10 TEXT,
  ADD COLUMN IF NOT EXISTS isbn_13 TEXT;

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_books_categories ON books USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_books_published_date ON books(published_date);
CREATE INDEX IF NOT EXISTS idx_books_average_rating ON books(average_rating);
