-- Migration: RLS for hidden content (run after moderation columns and report-content are in place)
-- Replaces existing SELECT policies so hidden_at / hidden content is enforced.

-- activity_comments: drop existing "readable by viewers" and replace with policy that hides reported comments from everyone except author
DROP POLICY IF EXISTS "Activity comments are readable by viewers" ON activity_comments;
CREATE POLICY "Activity comments are readable by viewers"
  ON activity_comments
  FOR SELECT
  USING (
    can_view_content(auth.uid(), user_id)
    AND (hidden_at IS NULL OR user_id = auth.uid())
  );

-- user_books: drop existing "readable by viewers" and replace with policy that hides reported user_books from everyone except owner
DROP POLICY IF EXISTS "User books are readable by viewers" ON user_books;
CREATE POLICY "User books are readable by viewers"
  ON user_books
  FOR SELECT
  USING (
    (auth.uid() = user_id)
    OR (hidden_at IS NULL AND can_view_content(auth.uid(), user_id))
  );
