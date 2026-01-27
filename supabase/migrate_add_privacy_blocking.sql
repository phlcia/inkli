-- Migration: Add account privacy, follow requests, blocking, and muting

-- Account type on user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'public'
  CHECK (account_type IN ('public', 'private'));

-- Follow requests (for private accounts)
CREATE TABLE IF NOT EXISTS follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, requested_id),
  CHECK (requester_id != requested_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_requests_requester ON follow_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_requested ON follow_requests(requested_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_status ON follow_requests(status);
CREATE INDEX IF NOT EXISTS idx_follow_requests_requested_status ON follow_requests(requested_id, status);

-- Blocked users
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_pair ON blocked_users(blocker_id, blocked_id);

-- Muted users
CREATE TABLE IF NOT EXISTS muted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (muter_id, muted_id),
  CHECK (muter_id != muted_id)
);

CREATE INDEX IF NOT EXISTS idx_muted_users_muter ON muted_users(muter_id);
CREATE INDEX IF NOT EXISTS idx_muted_users_muted ON muted_users(muted_id);
CREATE INDEX IF NOT EXISTS idx_muted_users_pair ON muted_users(muter_id, muted_id);

-- Helper functions (privacy + notifications)
CREATE OR REPLACE FUNCTION is_blocked_between(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  );
$$;

CREATE OR REPLACE FUNCTION is_muted_between(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM muted_users
    WHERE (muter_id = p_user_a AND muted_id = p_user_b)
       OR (muter_id = p_user_b AND muted_id = p_user_a)
  );
$$;

CREATE OR REPLACE FUNCTION can_view_profile(p_viewer_id uuid, p_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  has_profile boolean;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NOT NULL AND p_viewer_id = p_owner_id THEN
    RETURN true;
  END IF;

  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_owner_id) INTO has_profile;
  IF NOT has_profile THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NULL THEN
    RETURN false;
  END IF;

  IF is_blocked_between(p_viewer_id, p_owner_id) THEN
    IF EXISTS (
      SELECT 1 FROM blocked_users
      WHERE blocker_id = p_viewer_id
        AND blocked_id = p_owner_id
    ) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION can_view_content(p_viewer_id uuid, p_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  is_public boolean;
  is_following boolean;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NOT NULL AND p_viewer_id = p_owner_id THEN
    RETURN true;
  END IF;

  SELECT (account_type = 'public') INTO is_public
  FROM user_profiles
  WHERE user_id = p_owner_id;

  IF is_public IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NULL THEN
    RETURN is_public;
  END IF;

  IF is_blocked_between(p_viewer_id, p_owner_id) THEN
    IF EXISTS (
      SELECT 1 FROM blocked_users
      WHERE blocker_id = p_viewer_id
        AND blocked_id = p_owner_id
    ) THEN
      RETURN false;
    END IF;
    RETURN false;
  END IF;

  IF is_public THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM user_follows
    WHERE follower_id = p_viewer_id
      AND following_id = p_owner_id
  ) INTO is_following;

  RETURN is_following;
END;
$$;

CREATE OR REPLACE FUNCTION should_notify(p_actor_id uuid, p_recipient_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT NOT is_blocked_between(p_actor_id, p_recipient_id)
     AND NOT is_muted_between(p_actor_id, p_recipient_id)
     AND p_actor_id IS NOT NULL
     AND p_recipient_id IS NOT NULL
     AND p_actor_id != p_recipient_id;
$$;

-- Follow requests updated_at trigger
CREATE OR REPLACE FUNCTION update_follow_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_follow_requests_updated_at ON follow_requests;
CREATE TRIGGER update_follow_requests_updated_at
  BEFORE UPDATE ON follow_requests
  FOR EACH ROW EXECUTE FUNCTION update_follow_requests_updated_at();

-- Follow request notifications
CREATE OR REPLACE FUNCTION notify_follow_request()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' AND should_notify(NEW.requester_id, NEW.requested_id) THEN
    INSERT INTO notifications (recipient_id, actor_id, type, created_at)
    VALUES (NEW.requested_id, NEW.requester_id, 'follow_request', NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_follow_request_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'accepted' AND should_notify(NEW.requested_id, NEW.requester_id) THEN
    INSERT INTO notifications (recipient_id, actor_id, type, created_at)
    VALUES (NEW.requester_id, NEW.requested_id, 'follow_accept', NEW.updated_at);
  ELSIF NEW.status = 'rejected' AND should_notify(NEW.requested_id, NEW.requester_id) THEN
    INSERT INTO notifications (recipient_id, actor_id, type, created_at)
    VALUES (NEW.requester_id, NEW.requested_id, 'follow_reject', NEW.updated_at);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS follow_requests_notification_trigger ON follow_requests;
CREATE TRIGGER follow_requests_notification_trigger
  AFTER INSERT ON follow_requests
  FOR EACH ROW EXECUTE FUNCTION notify_follow_request();

DROP TRIGGER IF EXISTS follow_requests_update_notification_trigger ON follow_requests;
CREATE TRIGGER follow_requests_update_notification_trigger
  AFTER UPDATE ON follow_requests
  FOR EACH ROW EXECUTE FUNCTION notify_follow_request_update();

-- Notifications type expansion
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'follow_request', 'follow_accept', 'follow_reject'));

-- Update notification functions to respect blocks/mutes
CREATE OR REPLACE FUNCTION notify_activity_like()
RETURNS TRIGGER AS $$
DECLARE
  recipient_uuid UUID;
BEGIN
  SELECT user_id INTO recipient_uuid
  FROM user_books
  WHERE id = NEW.user_book_id;

  IF recipient_uuid IS NULL OR NOT should_notify(NEW.user_id, recipient_uuid) THEN
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

  IF recipient_uuid IS NULL OR NOT should_notify(NEW.user_id, recipient_uuid) THEN
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

  IF should_notify(NEW.follower_id, NEW.following_id) THEN
    INSERT INTO notifications (recipient_id, actor_id, type, created_at)
    VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.created_at);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Follow + privacy RPC helpers
CREATE OR REPLACE FUNCTION request_follow(p_requester_id uuid, p_requested_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  target_type text;
  existing_request text;
BEGIN
  IF p_requester_id IS NULL OR p_requested_id IS NULL THEN
    RAISE EXCEPTION 'Missing user ids';
  END IF;

  IF p_requester_id = p_requested_id THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;

  IF is_blocked_between(p_requester_id, p_requested_id) THEN
    RAISE EXCEPTION 'User is not available';
  END IF;

  SELECT status INTO existing_request
  FROM follow_requests
  WHERE requester_id = p_requester_id
    AND requested_id = p_requested_id
  LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM user_follows
    WHERE follower_id = p_requester_id
      AND following_id = p_requested_id
  ) THEN
    RETURN 'following';
  END IF;

  SELECT account_type INTO target_type
  FROM user_profiles
  WHERE user_id = p_requested_id;

  IF target_type IS NULL OR target_type = 'public' THEN
    INSERT INTO user_follows (follower_id, following_id)
    VALUES (p_requester_id, p_requested_id)
    ON CONFLICT DO NOTHING;

    UPDATE follow_requests
    SET status = 'accepted'
    WHERE requester_id = p_requester_id
      AND requested_id = p_requested_id
      AND status = 'pending';

    RETURN 'following';
  END IF;

  IF existing_request = 'pending' THEN
    RETURN 'requested';
  END IF;

  INSERT INTO follow_requests (requester_id, requested_id, status)
  VALUES (p_requester_id, p_requested_id, 'pending')
  ON CONFLICT DO NOTHING;

  RETURN 'requested';
END;
$$;

CREATE OR REPLACE FUNCTION accept_follow_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  req record;
  acting_user uuid;
BEGIN
  acting_user := auth.uid();
  SELECT * INTO req FROM follow_requests WHERE id = p_request_id FOR UPDATE;

  IF req IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF acting_user IS NULL OR acting_user != req.requested_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF req.status != 'pending' THEN
    RETURN;
  END IF;

  UPDATE follow_requests
  SET status = 'accepted'
  WHERE id = p_request_id;

  INSERT INTO user_follows (follower_id, following_id)
  VALUES (req.requester_id, req.requested_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION reject_follow_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  req record;
  acting_user uuid;
BEGIN
  acting_user := auth.uid();
  SELECT * INTO req FROM follow_requests WHERE id = p_request_id FOR UPDATE;

  IF req IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF acting_user IS NULL OR acting_user != req.requested_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF req.status != 'pending' THEN
    RETURN;
  END IF;

  UPDATE follow_requests
  SET status = 'rejected'
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION block_user(p_blocker_id uuid, p_blocked_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF p_blocker_id IS NULL OR p_blocked_id IS NULL THEN
    RAISE EXCEPTION 'Missing user ids';
  END IF;

  IF p_blocker_id = p_blocked_id THEN
    RAISE EXCEPTION 'Cannot block yourself';
  END IF;

  INSERT INTO blocked_users (blocker_id, blocked_id)
  VALUES (p_blocker_id, p_blocked_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM user_follows
  WHERE (follower_id = p_blocker_id AND following_id = p_blocked_id)
     OR (follower_id = p_blocked_id AND following_id = p_blocker_id);

  DELETE FROM follow_requests
  WHERE (requester_id = p_blocker_id AND requested_id = p_blocked_id)
     OR (requester_id = p_blocked_id AND requested_id = p_blocker_id);
END;
$$;

-- RLS for new tables
ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE muted_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant follow requests" ON follow_requests;
CREATE POLICY "Users can view relevant follow requests"
  ON follow_requests
  FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = requested_id);

DROP POLICY IF EXISTS "Users can create follow requests" ON follow_requests;
CREATE POLICY "Users can create follow requests"
  ON follow_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND NOT is_blocked_between(requester_id, requested_id)
  );

DROP POLICY IF EXISTS "Users can respond to follow requests" ON follow_requests;
CREATE POLICY "Users can respond to follow requests"
  ON follow_requests
  FOR UPDATE
  USING (auth.uid() = requested_id)
  WITH CHECK (auth.uid() = requested_id);

DROP POLICY IF EXISTS "Users can delete their follow requests" ON follow_requests;
CREATE POLICY "Users can delete their follow requests"
  ON follow_requests
  FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = requested_id);

DROP POLICY IF EXISTS "Users can view block relationships involving them" ON blocked_users;
CREATE POLICY "Users can view block relationships involving them"
  ON blocked_users
  FOR SELECT
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS "Users can create blocks as themselves" ON blocked_users;
CREATE POLICY "Users can create blocks as themselves"
  ON blocked_users
  FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can delete blocks as themselves" ON blocked_users;
CREATE POLICY "Users can delete blocks as themselves"
  ON blocked_users
  FOR DELETE
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can view muted users" ON muted_users;
CREATE POLICY "Users can view muted users"
  ON muted_users
  FOR SELECT
  USING (auth.uid() = muter_id);

DROP POLICY IF EXISTS "Users can create mutes as themselves" ON muted_users;
CREATE POLICY "Users can create mutes as themselves"
  ON muted_users
  FOR INSERT
  WITH CHECK (auth.uid() = muter_id);

DROP POLICY IF EXISTS "Users can delete mutes as themselves" ON muted_users;
CREATE POLICY "Users can delete mutes as themselves"
  ON muted_users
  FOR DELETE
  USING (auth.uid() = muter_id);

-- Update existing policies for privacy
ALTER TABLE user_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User books are readable by viewers" ON user_books;
CREATE POLICY "User books are readable by viewers"
  ON user_books
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users can manage their own user books" ON user_books;
CREATE POLICY "Users can manage their own user books"
  ON user_books
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view public profile fields" ON user_profiles;
CREATE POLICY "Anyone can view public profile fields"
  ON user_profiles
  FOR SELECT
  USING (can_view_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Activity cards are readable by anyone" ON activity_cards;
CREATE POLICY "Activity cards are readable by viewers"
  ON activity_cards
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

DROP POLICY IF EXISTS "Activity comments are readable by anyone" ON activity_comments;
CREATE POLICY "Activity comments are readable by viewers"
  ON activity_comments
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

DROP POLICY IF EXISTS "Activity likes are readable by anyone" ON activity_likes;
CREATE POLICY "Activity likes are readable by viewers"
  ON activity_likes
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

DROP POLICY IF EXISTS "Comment likes are readable by anyone" ON activity_comment_likes;
CREATE POLICY "Comment likes are readable by viewers"
  ON activity_comment_likes
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

-- Update follow policies to prevent blocked follows
DROP POLICY IF EXISTS "Users can insert own follows" ON user_follows;
CREATE POLICY "Users can insert own follows"
  ON user_follows
  FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id
    AND NOT is_blocked_between(follower_id, following_id)
  );

-- Feed RPC filtering for blocks/mutes
CREATE OR REPLACE FUNCTION get_followed_activity_cards(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  activity_id UUID,
  activity_created_at TIMESTAMPTZ,
  activity_content TEXT,
  activity_image_url TEXT,
  user_id UUID,
  username TEXT,
  profile_photo_url TEXT,
  user_book_id UUID,
  user_book_status TEXT,
  user_book_rank_score NUMERIC,
  user_book_rating TEXT,
  user_book_notes TEXT,
  user_book_started_date DATE,
  user_book_finished_date DATE,
  read_count INTEGER,
  user_book_likes_count INTEGER,
  user_book_comments_count INTEGER,
  user_book_created_at TIMESTAMPTZ,
  user_book_updated_at TIMESTAMPTZ,
  book_id UUID,
  book_title TEXT,
  book_authors TEXT[],
  book_cover_url TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ac.id AS activity_id,
    ac.created_at AS activity_created_at,
    ac.content AS activity_content,
    ac.image_url AS activity_image_url,
    ac.user_id,
    up.username,
    up.profile_photo_url,
    ub.id AS user_book_id,
    ub.status AS user_book_status,
    ub.rank_score AS user_book_rank_score,
    ub.rating AS user_book_rating,
    ub.notes AS user_book_notes,
    latest_session.started_date AS user_book_started_date,
    latest_session.finished_date AS user_book_finished_date,
    COALESCE(latest_session.read_count, 0)::INTEGER AS read_count,
    ub.likes_count AS user_book_likes_count,
    ub.comments_count AS user_book_comments_count,
    ub.created_at AS user_book_created_at,
    ub.updated_at AS user_book_updated_at,
    b.id AS book_id,
    b.title AS book_title,
    b.authors AS book_authors,
    b.cover_url AS book_cover_url
  FROM activity_cards ac
  JOIN user_follows uf
    ON uf.following_id = ac.user_id
   AND uf.follower_id = p_user_id
  JOIN user_profiles up
    ON up.user_id = ac.user_id
  JOIN user_books ub
    ON ub.id = ac.user_book_id
  JOIN books b
    ON b.id = ub.book_id
  LEFT JOIN LATERAL (
    SELECT 
      started_date, 
      finished_date,
      COUNT(*) OVER (PARTITION BY user_book_id) as read_count
    FROM user_book_read_sessions
    WHERE user_book_id = ub.id
    ORDER BY 
      CASE WHEN finished_date IS NOT NULL THEN 0 ELSE 1 END ASC,
      COALESCE(finished_date, '1900-01-01'::date) DESC,
      COALESCE(started_date, '1900-01-01'::date) DESC,
      created_at DESC
    LIMIT 1
  ) latest_session ON true
  WHERE (
    p_cursor_created_at IS NULL
    OR p_cursor_id IS NULL
    OR (ac.created_at, ac.id) < (p_cursor_created_at, p_cursor_id)
  )
  AND NOT is_blocked_between(p_user_id, ac.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM muted_users
    WHERE muter_id = p_user_id
      AND muted_id = ac.user_id
  )
  ORDER BY ac.created_at DESC, ac.id DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_followed_user_books_activity(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  activity_id UUID,
  activity_created_at TIMESTAMPTZ,
  activity_content TEXT,
  activity_image_url TEXT,
  user_id UUID,
  username TEXT,
  profile_photo_url TEXT,
  user_book_id UUID,
  user_book_status TEXT,
  user_book_rank_score NUMERIC,
  user_book_rating TEXT,
  user_book_notes TEXT,
  user_book_started_date DATE,
  user_book_finished_date DATE,
  read_count INTEGER,
  user_book_likes_count INTEGER,
  user_book_comments_count INTEGER,
  user_book_created_at TIMESTAMPTZ,
  user_book_updated_at TIMESTAMPTZ,
  book_id UUID,
  book_title TEXT,
  book_authors TEXT[],
  book_cover_url TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ub.id AS activity_id,
    ub.updated_at AS activity_created_at,
    CASE
      WHEN ub.status = 'read' THEN 'finished "' || b.title || '"'
      WHEN ub.status = 'currently_reading' THEN 'started "' || b.title || '"'
      WHEN ub.status = 'want_to_read' THEN 'saved "' || b.title || '"'
      ELSE 'updated "' || b.title || '"'
    END AS activity_content,
    b.cover_url AS activity_image_url,
    ub.user_id,
    up.username,
    up.profile_photo_url,
    ub.id AS user_book_id,
    ub.status AS user_book_status,
    ub.rank_score AS user_book_rank_score,
    ub.rating AS user_book_rating,
    ub.notes AS user_book_notes,
    latest_session.started_date AS user_book_started_date,
    latest_session.finished_date AS user_book_finished_date,
    COALESCE(latest_session.read_count, 0)::INTEGER AS read_count,
    ub.likes_count AS user_book_likes_count,
    ub.comments_count AS user_book_comments_count,
    ub.created_at AS user_book_created_at,
    ub.updated_at AS user_book_updated_at,
    b.id AS book_id,
    b.title AS book_title,
    b.authors AS book_authors,
    b.cover_url AS book_cover_url
  FROM user_books ub
  JOIN user_follows uf
    ON uf.following_id = ub.user_id
   AND uf.follower_id = p_user_id
  JOIN books b
    ON b.id = ub.book_id
  JOIN user_profiles up
    ON up.user_id = ub.user_id
  LEFT JOIN LATERAL (
    SELECT 
      started_date, 
      finished_date,
      COUNT(*) OVER (PARTITION BY user_book_id) as read_count
    FROM user_book_read_sessions
    WHERE user_book_id = ub.id
    ORDER BY 
      CASE WHEN finished_date IS NOT NULL THEN 0 ELSE 1 END ASC,
      COALESCE(finished_date, '1900-01-01'::date) DESC,
      COALESCE(started_date, '1900-01-01'::date) DESC,
      created_at DESC
    LIMIT 1
  ) latest_session ON true
  WHERE (
    p_cursor_updated_at IS NULL
    OR p_cursor_id IS NULL
    OR (ub.updated_at, ub.id) < (p_cursor_updated_at, p_cursor_id)
  )
  AND NOT is_blocked_between(p_user_id, ub.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM muted_users
    WHERE muter_id = p_user_id
      AND muted_id = ub.user_id
  )
  ORDER BY ub.updated_at DESC, ub.id DESC
  LIMIT p_limit;
$$;
