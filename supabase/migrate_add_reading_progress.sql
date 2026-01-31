-- Add reading progress tracking to user_books

ALTER TABLE user_books
  ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  ADD COLUMN IF NOT EXISTS last_progress_update TIMESTAMPTZ;

-- Ensure currently-reading books start at 0%
UPDATE user_books
SET progress_percent = 0
WHERE status = 'currently_reading' AND progress_percent IS NULL;

-- Index to support progress queries on currently_reading shelf
CREATE INDEX IF NOT EXISTS idx_user_books_progress
  ON user_books(user_id, status, progress_percent)
  WHERE status = 'currently_reading';

-- Update last_progress_update whenever progress_percent changes
CREATE OR REPLACE FUNCTION set_user_books_last_progress_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress_percent IS DISTINCT FROM OLD.progress_percent THEN
    NEW.last_progress_update = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_books_progress_update_trigger ON user_books;
CREATE TRIGGER user_books_progress_update_trigger
  BEFORE UPDATE OF progress_percent ON user_books
  FOR EACH ROW
  EXECUTE FUNCTION set_user_books_last_progress_update();
