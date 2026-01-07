-- SUPERSEDED by migrate_add_activity_comments.sql (FK now added there)
-- Ensure FK name for activity_comment_likes -> user_profiles matches app join hint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_activity_comment_likes_user'
  ) THEN
    ALTER TABLE activity_comment_likes
      ADD CONSTRAINT fk_activity_comment_likes_user
      FOREIGN KEY (user_id)
      REFERENCES user_profiles(user_id)
      ON DELETE CASCADE;
  END IF;
END$$;
