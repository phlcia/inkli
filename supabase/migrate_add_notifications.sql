-- Migration: Notifications table + triggers

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow')),
  user_book_id UUID REFERENCES user_books(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES activity_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_actor
  ON notifications(actor_id);

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_actor
  FOREIGN KEY (actor_id)
  REFERENCES user_profiles(user_id)
  ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_recipient
  FOREIGN KEY (recipient_id)
  REFERENCES user_profiles(user_id)
  ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_user_book
  FOREIGN KEY (user_book_id)
  REFERENCES user_books(id)
  ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_comment
  FOREIGN KEY (comment_id)
  REFERENCES activity_comments(id)
  ON DELETE CASCADE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications
  FOR SELECT
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can create notifications as actor" ON notifications;
CREATE POLICY "Users can create notifications as actor"
  ON notifications
  FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

CREATE OR REPLACE FUNCTION notify_activity_like()
RETURNS TRIGGER AS $$
DECLARE
  recipient_uuid UUID;
BEGIN
  SELECT user_id INTO recipient_uuid
  FROM user_books
  WHERE id = NEW.user_book_id;

  IF recipient_uuid IS NULL OR recipient_uuid = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (recipient_id, actor_id, type, user_book_id, created_at)
  VALUES (recipient_uuid, NEW.user_id, 'like', NEW.user_book_id, NEW.created_at);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_activity_comment()
RETURNS TRIGGER AS $$
DECLARE
  recipient_uuid UUID;
BEGIN
  SELECT user_id INTO recipient_uuid
  FROM user_books
  WHERE id = NEW.user_book_id;

  IF recipient_uuid IS NULL OR recipient_uuid = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (recipient_id, actor_id, type, user_book_id, comment_id, created_at)
  VALUES (recipient_uuid, NEW.user_id, 'comment', NEW.user_book_id, NEW.id, NEW.created_at);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_follow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.following_id = NEW.follower_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (recipient_id, actor_id, type, created_at)
  VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.created_at);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_likes_notification_trigger ON activity_likes;
CREATE TRIGGER activity_likes_notification_trigger
AFTER INSERT ON activity_likes
FOR EACH ROW EXECUTE FUNCTION notify_activity_like();

DROP TRIGGER IF EXISTS activity_comments_notification_trigger ON activity_comments;
CREATE TRIGGER activity_comments_notification_trigger
AFTER INSERT ON activity_comments
FOR EACH ROW EXECUTE FUNCTION notify_activity_comment();

DROP TRIGGER IF EXISTS user_follows_notification_trigger ON user_follows;
CREATE TRIGGER user_follows_notification_trigger
AFTER INSERT ON user_follows
FOR EACH ROW EXECUTE FUNCTION notify_follow();
