-- Migration: Add user_book_read_sessions table for multiple date ranges
-- This allows users to track multiple reading sessions for the same book

-- Create user_book_read_sessions table
CREATE TABLE IF NOT EXISTS user_book_read_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_book_id UUID NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  started_date DATE, -- NULLABLE (allows sessions with only finished_date)
  finished_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT at_least_one_date CHECK (started_date IS NOT NULL OR finished_date IS NOT NULL),
  CONSTRAINT valid_date_range CHECK (finished_date IS NULL OR started_date IS NULL OR finished_date >= started_date)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_read_sessions_user_book_id ON user_book_read_sessions(user_book_id);
CREATE INDEX IF NOT EXISTS idx_read_sessions_dates ON user_book_read_sessions(started_date, finished_date);

-- Enable RLS
ALTER TABLE user_book_read_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all read sessions"
  ON user_book_read_sessions FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own read sessions"
  ON user_book_read_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_books
      WHERE id = user_book_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own read sessions"
  ON user_book_read_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_books
      WHERE id = user_book_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own read sessions"
  ON user_book_read_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_books
      WHERE id = user_book_id AND user_id = auth.uid()
    )
  );

-- Migrate existing started_date/finished_date to read_sessions
INSERT INTO user_book_read_sessions (user_book_id, started_date, finished_date, created_at, updated_at)
SELECT 
  id,
  started_date,
  finished_date,
  created_at,
  updated_at
FROM user_books
WHERE started_date IS NOT NULL OR finished_date IS NOT NULL;
