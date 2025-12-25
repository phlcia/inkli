-- Migration: Add Open Library support to books table
-- Run this SQL in Supabase SQL Editor

-- Add Open Library ID column (keep google_books_id for now)
ALTER TABLE books ADD COLUMN IF NOT EXISTS open_library_id text;

-- Create unique index on open_library_id
CREATE UNIQUE INDEX IF NOT EXISTS books_open_library_id_key ON books(open_library_id);

-- Add first_published field to store original publication year
ALTER TABLE books ADD COLUMN IF NOT EXISTS first_published integer;

-- Ensure we have at least one ID
ALTER TABLE books ADD CONSTRAINT books_has_id CHECK (
  open_library_id IS NOT NULL OR google_books_id IS NOT NULL
);

