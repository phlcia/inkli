-- SUPERSEDED by migrate_activity_cards_user_book_link.sql
-- Feed query based on user_books activity and bridge to activity_cards

CREATE INDEX IF NOT EXISTS idx_user_books_user_updated_at
  ON user_books(user_id, updated_at DESC, id DESC);

CREATE OR REPLACE FUNCTION get_followed_user_books_activity(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor_updated_at TIMESTAMPTZ DEFAULT NULL,
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
    ub.id,
    ub.user_id,
    CASE
      WHEN ub.status = 'read' THEN 'finished "' || b.title || '"'
      WHEN ub.status = 'currently_reading' THEN 'started "' || b.title || '"'
      WHEN ub.status = 'want_to_read' THEN 'saved "' || b.title || '"'
      ELSE 'updated "' || b.title || '"'
    END AS content,
    b.cover_url AS image_url,
    ub.updated_at AS created_at,
    up.username,
    up.profile_photo_url
  FROM user_books ub
  JOIN user_follows uf
    ON uf.following_id = ub.user_id
   AND uf.follower_id = p_user_id
  JOIN books b
    ON b.id = ub.book_id
  JOIN user_profiles up
    ON up.user_id = ub.user_id
  WHERE (
    p_cursor_updated_at IS NULL
    OR p_cursor_id IS NULL
    OR (ub.updated_at, ub.id) < (p_cursor_updated_at, p_cursor_id)
  )
  ORDER BY ub.updated_at DESC, ub.id DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION emit_activity_card_from_user_books()
RETURNS TRIGGER AS $$
DECLARE
  book_title TEXT;
  book_cover TEXT;
  action_text TEXT;
BEGIN
  SELECT title, cover_url
    INTO book_title, book_cover
    FROM books
   WHERE id = NEW.book_id;

  IF (TG_OP = 'INSERT') THEN
    action_text := 'added "' || book_title || '"';
    INSERT INTO activity_cards (user_id, content, image_url, created_at)
    VALUES (NEW.user_id, action_text, book_cover, NEW.created_at);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      action_text := 'updated "' || book_title || '" status';
    ELSIF (NEW.rating IS DISTINCT FROM OLD.rating) THEN
      action_text := 'rated "' || book_title || '"';
    ELSIF (NEW.notes IS DISTINCT FROM OLD.notes) THEN
      action_text := 'added notes on "' || book_title || '"';
    ELSE
      RETURN NEW;
    END IF;

    INSERT INTO activity_cards (user_id, content, image_url, created_at)
    VALUES (NEW.user_id, action_text, book_cover, NEW.updated_at);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_books_activity_trigger ON user_books;
CREATE TRIGGER user_books_activity_trigger
AFTER INSERT OR UPDATE ON user_books
FOR EACH ROW EXECUTE FUNCTION emit_activity_card_from_user_books();

-- One-time backfill for recent activity (adjust interval as needed).
INSERT INTO activity_cards (user_id, content, image_url, created_at)
SELECT
  ub.user_id,
  CASE
    WHEN ub.status = 'read' THEN 'finished "' || b.title || '"'
    WHEN ub.status = 'currently_reading' THEN 'started "' || b.title || '"'
    WHEN ub.status = 'want_to_read' THEN 'saved "' || b.title || '"'
    ELSE 'updated "' || b.title || '"'
  END AS content,
  b.cover_url AS image_url,
  ub.updated_at
FROM user_books ub
JOIN books b ON b.id = ub.book_id
WHERE ub.updated_at >= NOW() - INTERVAL '90 days';
