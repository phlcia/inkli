-- Activity comments and comment likes

CREATE TABLE IF NOT EXISTS activity_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_book_id UUID NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES activity_comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_comments_text_length
    CHECK (char_length(comment_text) > 0 AND char_length(comment_text) <= 1000)
);

ALTER TABLE activity_comments
  ADD CONSTRAINT fk_activity_comments_user
  FOREIGN KEY (user_id)
  REFERENCES user_profiles(user_id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_activity_comments_user_book ON activity_comments(user_book_id);
CREATE INDEX IF NOT EXISTS idx_activity_comments_user ON activity_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_comments_created ON activity_comments(created_at DESC);

ALTER TABLE user_books
  ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_books_comments_count ON user_books(comments_count);

CREATE OR REPLACE FUNCTION update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE user_books
    SET comments_count = comments_count + 1
    WHERE id = NEW.user_book_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE user_books
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.user_book_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_comments_count_trigger ON activity_comments;
CREATE TRIGGER activity_comments_count_trigger
AFTER INSERT OR DELETE ON activity_comments
FOR EACH ROW EXECUTE FUNCTION update_comments_count();

CREATE OR REPLACE FUNCTION update_comment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_comments_updated_trigger ON activity_comments;
CREATE TRIGGER activity_comments_updated_trigger
BEFORE UPDATE ON activity_comments
FOR EACH ROW EXECUTE FUNCTION update_comment_timestamp();

ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity comments are readable by anyone" ON activity_comments;
CREATE POLICY "Activity comments are readable by anyone"
  ON activity_comments
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can add comments as themselves" ON activity_comments;
CREATE POLICY "Users can add comments as themselves"
  ON activity_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their comments" ON activity_comments;
CREATE POLICY "Users can update their comments"
  ON activity_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their comments" ON activity_comments;
CREATE POLICY "Users can delete their comments"
  ON activity_comments
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS activity_comment_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES activity_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_comment_likes_comment ON activity_comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_activity_comment_likes_user ON activity_comment_likes(user_id);

ALTER TABLE activity_comment_likes
  ADD CONSTRAINT fk_activity_comment_likes_user
  FOREIGN KEY (user_id)
  REFERENCES user_profiles(user_id)
  ON DELETE CASCADE;

ALTER TABLE activity_comments
  ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_activity_comments_likes_count ON activity_comments(likes_count);

CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE activity_comments
    SET likes_count = likes_count + 1
    WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE activity_comments
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_comment_likes_count_trigger ON activity_comment_likes;
CREATE TRIGGER activity_comment_likes_count_trigger
AFTER INSERT OR DELETE ON activity_comment_likes
FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();

ALTER TABLE activity_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes are readable by anyone" ON activity_comment_likes;
CREATE POLICY "Comment likes are readable by anyone"
  ON activity_comment_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can like comments as themselves" ON activity_comment_likes;
CREATE POLICY "Users can like comments as themselves"
  ON activity_comment_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike their comment likes" ON activity_comment_likes;
CREATE POLICY "Users can unlike their comment likes"
  ON activity_comment_likes
  FOR DELETE
  USING (auth.uid() = user_id);
