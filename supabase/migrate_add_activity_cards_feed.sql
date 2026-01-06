-- Activity cards for social feed

CREATE TABLE IF NOT EXISTS activity_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_cards_user_created_at
  ON activity_cards(user_id, created_at DESC);

ALTER TABLE activity_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity cards are readable by anyone" ON activity_cards;
CREATE POLICY "Activity cards are readable by anyone"
  ON activity_cards
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create their own activity cards" ON activity_cards;
CREATE POLICY "Users can create their own activity cards"
  ON activity_cards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own activity cards" ON activity_cards;
CREATE POLICY "Users can update their own activity cards"
  ON activity_cards
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own activity cards" ON activity_cards;
CREATE POLICY "Users can delete their own activity cards"
  ON activity_cards
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION get_followed_activity_cards(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ,
  username TEXT,
  profile_photo_url TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ac.id,
    ac.user_id,
    ac.content,
    ac.image_url,
    ac.created_at,
    up.username,
    up.profile_photo_url
  FROM activity_cards ac
  JOIN user_follows uf
    ON uf.following_id = ac.user_id
   AND uf.follower_id = p_user_id
  JOIN user_profiles up
    ON up.user_id = ac.user_id
  WHERE (
    p_cursor_created_at IS NULL
    OR p_cursor_id IS NULL
    OR (ac.created_at, ac.id) < (p_cursor_created_at, p_cursor_id)
  )
  ORDER BY ac.created_at DESC, ac.id DESC
  LIMIT p_limit;
$$;
