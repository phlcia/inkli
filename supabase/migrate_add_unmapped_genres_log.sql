-- Migration: Add unmapped genres log table for tracking API categories not in lookup table
-- This enables data-driven expansion of the genre lookup table

-- Track API categories that couldn't be mapped for lookup table expansion
CREATE TABLE IF NOT EXISTS unmapped_genres_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_category TEXT NOT NULL,
  book_id UUID REFERENCES books(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unmapped_genres_category ON unmapped_genres_log(api_category);
CREATE INDEX IF NOT EXISTS idx_unmapped_genres_created ON unmapped_genres_log(created_at DESC);

-- Enable RLS
ALTER TABLE unmapped_genres_log ENABLE ROW LEVEL SECURITY;

-- Anyone can insert unmapped genre logs (for analytics)
DROP POLICY IF EXISTS "Anyone can insert unmapped genre logs" ON unmapped_genres_log;
CREATE POLICY "Anyone can insert unmapped genre logs"
  ON unmapped_genres_log
  FOR INSERT
  WITH CHECK (true);

-- Only admins/servers can read unmapped genre logs (for admin queries)
-- For now, allow authenticated users to read (can restrict further if needed)
DROP POLICY IF EXISTS "Authenticated users can read unmapped genre logs" ON unmapped_genres_log;
CREATE POLICY "Authenticated users can read unmapped genre logs"
  ON unmapped_genres_log
  FOR SELECT
  USING (auth.role() = 'authenticated');
