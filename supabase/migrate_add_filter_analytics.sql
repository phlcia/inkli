-- Migration: Add filter analytics table for tracking filter usage
-- MVP: Only 2 event types (filter_applied, filter_cleared)

-- Filter usage events table
CREATE TABLE IF NOT EXISTS filter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'filter_applied',
    'filter_cleared'
  )),
  selected_genres TEXT[],
  selected_custom_labels TEXT[],
  shelf_context TEXT CHECK (shelf_context IN ('want_to_read', 'currently_reading', 'read', 'all')),
  result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filter_events_user_created ON filter_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_filter_events_type ON filter_events(event_type);
CREATE INDEX IF NOT EXISTS idx_filter_events_genres ON filter_events USING GIN(selected_genres);
CREATE INDEX IF NOT EXISTS idx_filter_events_custom_labels ON filter_events USING GIN(selected_custom_labels);

-- Enable RLS
ALTER TABLE filter_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own filter events
DROP POLICY IF EXISTS "Users can insert own filter events" ON filter_events;
CREATE POLICY "Users can insert own filter events"
  ON filter_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own filter events
DROP POLICY IF EXISTS "Users can read own filter events" ON filter_events;
CREATE POLICY "Users can read own filter events"
  ON filter_events
  FOR SELECT
  USING (auth.uid() = user_id);
