-- Activity likes table and denormalized likes count

CREATE TABLE IF NOT EXISTS activity_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_book_id UUID NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_book_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_likes_user_book ON activity_likes(user_book_id);
CREATE INDEX IF NOT EXISTS idx_activity_likes_user ON activity_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_likes_user_id ON activity_likes(user_id);

ALTER TABLE activity_likes
  ADD CONSTRAINT fk_activity_likes_user
  FOREIGN KEY (user_id)
  REFERENCES user_profiles(user_id)
  ON DELETE CASCADE;

ALTER TABLE user_books
  ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_books_likes_count ON user_books(likes_count);

CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE user_books
    SET likes_count = likes_count + 1
    WHERE id = NEW.user_book_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE user_books
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.user_book_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_likes_count_trigger ON activity_likes;
CREATE TRIGGER activity_likes_count_trigger
AFTER INSERT OR DELETE ON activity_likes
FOR EACH ROW EXECUTE FUNCTION update_likes_count();

ALTER TABLE activity_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity likes are readable by anyone" ON activity_likes;
CREATE POLICY "Activity likes are readable by anyone"
  ON activity_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can like activity as themselves" ON activity_likes;
CREATE POLICY "Users can like activity as themselves"
  ON activity_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike their activity likes" ON activity_likes;
CREATE POLICY "Users can unlike their activity likes"
  ON activity_likes
  FOR DELETE
  USING (auth.uid() = user_id);
