-- Migration: Add recommendations table
-- Stores generated recommendations for users

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  score FLOAT NOT NULL,
  reason TEXT,
  algorithm_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  shown_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_created_at
  ON recommendations(user_id, created_at DESC);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own recommendations" ON recommendations;
CREATE POLICY "Users can read own recommendations"
  ON recommendations
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recommendations" ON recommendations;
CREATE POLICY "Users can update own recommendations"
  ON recommendations
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own recommendations" ON recommendations;
CREATE POLICY "Users can insert own recommendations"
  ON recommendations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
