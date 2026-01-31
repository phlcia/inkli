-- Consolidated schema snapshot (tables, indexes, functions, triggers, RLS)

-- Books table
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_books_id TEXT,
  open_library_id TEXT,
  title TEXT NOT NULL,
  authors TEXT[] NOT NULL,
  subtitle TEXT,
  publisher TEXT,
  published_date TEXT,
  description TEXT,
  page_count INTEGER,
  categories TEXT[],
  average_rating NUMERIC,
  ratings_count INTEGER,
  language TEXT,
  preview_link TEXT,
  info_link TEXT,
  isbn_10 TEXT,
  isbn_13 TEXT,
  first_published INTEGER,
  community_average_score NUMERIC(6,3) DEFAULT NULL,
  community_rank_count INTEGER DEFAULT 0,
  stats_last_updated TIMESTAMPTZ DEFAULT NULL,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT books_open_library_id_key UNIQUE (open_library_id),
  CONSTRAINT books_google_books_id_key UNIQUE (google_books_id),
  CONSTRAINT books_isbn_13_key UNIQUE (isbn_13),
  CONSTRAINT books_has_id CHECK (
    open_library_id IS NOT NULL OR google_books_id IS NOT NULL
  )
);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read books" ON public.books;
CREATE POLICY "Anyone can read books"
  ON public.books
  FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_books_google_id ON books(google_books_id);
CREATE INDEX IF NOT EXISTS idx_books_categories ON books USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_books_published_date ON books(published_date);
CREATE INDEX IF NOT EXISTS idx_books_average_rating ON books(average_rating);

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  reading_interests TEXT[] DEFAULT '{}',
  bio TEXT,
  profile_photo_url TEXT,
  books_read_count INTEGER DEFAULT 0,
  global_rank INTEGER,
  member_since TIMESTAMPTZ DEFAULT NOW(),
  weekly_streak INTEGER DEFAULT 0,
  notifications_last_seen_at TIMESTAMPTZ,
  account_type TEXT NOT NULL DEFAULT 'public' CHECK (account_type IN ('public', 'private')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Anyone can view public profile fields" ON user_profiles;
CREATE POLICY "Anyone can view public profile fields"
  ON user_profiles
  FOR SELECT
  USING (can_view_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User follows table
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following_id ON user_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower_following ON user_follows(follower_id, following_id);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view follows" ON user_follows;
CREATE POLICY "Anyone can view follows"
  ON user_follows
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert own follows" ON user_follows;
CREATE POLICY "Users can insert own follows"
  ON user_follows
  FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id
    AND NOT is_blocked_between(follower_id, following_id)
  );

DROP POLICY IF EXISTS "Users can delete own follows" ON user_follows;
CREATE POLICY "Users can delete own follows"
  ON user_follows
  FOR DELETE
  USING (auth.uid() = follower_id);

-- Follow requests table (private accounts)
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

-- Blocked users table
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

-- Muted users table
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

-- Privacy helper functions
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

-- RLS for privacy tables
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

-- User books table (junction table for user's shelf)
CREATE TABLE IF NOT EXISTS user_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  rank_score NUMERIC(6,3) DEFAULT NULL,
  status TEXT CHECK (status IN ('read', 'currently_reading', 'want_to_read')),
  rating TEXT CHECK (rating IN ('liked', 'fine', 'disliked')),
  notes TEXT,
  -- DEPRECATED: started_date and finished_date are removed - use user_book_read_sessions table instead
  -- These columns should be dropped via migrate_remove_old_date_columns.sql
  -- started_date DATE,
  -- finished_date DATE,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  last_progress_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_user_books_user_id ON user_books(user_id);
CREATE INDEX IF NOT EXISTS idx_user_books_rank_score ON user_books(user_id, rating, rank_score);
CREATE INDEX IF NOT EXISTS idx_user_books_book_rank_score
  ON user_books(book_id, rank_score)
  WHERE rank_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_books_likes_count ON user_books(likes_count);
CREATE INDEX IF NOT EXISTS idx_user_books_comments_count ON user_books(comments_count);
CREATE INDEX IF NOT EXISTS idx_user_books_user_updated_at ON user_books(user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_books_created_at ON user_books(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_books_updated_at ON user_books(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_user_books_progress
  ON user_books(user_id, status, progress_percent)
  WHERE status = 'currently_reading';

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

-- Activity cards table
CREATE TABLE IF NOT EXISTS activity_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_book_id UUID REFERENCES user_books(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_cards_user_created_at
  ON activity_cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_cards_user_book_id
  ON activity_cards(user_book_id);

ALTER TABLE activity_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity cards are readable by anyone" ON activity_cards;
CREATE POLICY "Activity cards are readable by viewers"
  ON activity_cards
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

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

-- Activity likes table
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

ALTER TABLE activity_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity likes are readable by anyone" ON activity_likes;
CREATE POLICY "Activity likes are readable by viewers"
  ON activity_likes
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

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

-- Activity comments table
CREATE TABLE IF NOT EXISTS activity_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_book_id UUID NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES activity_comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_activity_comments_likes_count ON activity_comments(likes_count);

ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity comments are readable by anyone" ON activity_comments;
CREATE POLICY "Activity comments are readable by viewers"
  ON activity_comments
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

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

-- Activity comment likes table
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

ALTER TABLE activity_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes are readable by anyone" ON activity_comment_likes;
CREATE POLICY "Comment likes are readable by viewers"
  ON activity_comment_likes
  FOR SELECT
  USING (can_view_content(auth.uid(), user_id));

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

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CONSTRAINT notifications_type_check
    CHECK (type IN ('like', 'comment', 'follow', 'follow_request', 'follow_accept', 'follow_reject')),
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

-- Recommendations table
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  score FLOAT NOT NULL,
  reason TEXT,
  algorithm_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  shown_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_created_at
  ON recommendations(user_id, created_at DESC);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own recommendations" ON recommendations;
CREATE POLICY "Users can read own recommendations"
  ON recommendations
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recommendations" ON recommendations;
CREATE POLICY "Users can update own recommendations"
  ON recommendations
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own recommendations" ON recommendations;
CREATE POLICY "Users can insert own recommendations"
  ON recommendations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Updated_at helper for user_books
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_books_updated_at ON user_books;
CREATE TRIGGER update_user_books_updated_at
  BEFORE UPDATE ON user_books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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

-- Updated_at helper for user_profiles
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- Community stats functions
CREATE OR REPLACE FUNCTION update_book_stats(book_id_param UUID)
RETURNS void AS $$
DECLARE
  avg_score NUMERIC(6,3);
  rank_count INTEGER;
BEGIN
  SELECT
    COALESCE(AVG(rank_score), NULL)::NUMERIC(6,3),
    COUNT(DISTINCT user_id)
  INTO avg_score, rank_count
  FROM user_books
  WHERE book_id = book_id_param
    AND rank_score IS NOT NULL;

  UPDATE books
  SET
    community_average_score = avg_score,
    community_rank_count = COALESCE(rank_count, 0),
    stats_last_updated = NOW()
  WHERE id = book_id_param;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_update_book_stats()
RETURNS TRIGGER AS $$
DECLARE
  affected_book_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_book_id := OLD.book_id;
  ELSE
    affected_book_id := NEW.book_id;
  END IF;

  IF TG_OP = 'INSERT' OR
     (TG_OP = 'UPDATE' AND (OLD.rank_score IS DISTINCT FROM NEW.rank_score)) OR
     TG_OP = 'DELETE' THEN
    PERFORM update_book_stats(affected_book_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_book_stats_trigger ON user_books;
CREATE TRIGGER update_book_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_books
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_book_stats();

-- Activity likes count triggers
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

-- Activity comments count + timestamp triggers
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

-- Activity comment likes count trigger
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

-- Notifications triggers
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

DROP TRIGGER IF EXISTS activity_likes_notification_trigger ON activity_likes;
CREATE TRIGGER activity_likes_notification_trigger
  AFTER INSERT ON activity_likes
  FOR EACH ROW EXECUTE FUNCTION notify_activity_like();

DROP TRIGGER IF EXISTS activity_comments_notification_trigger ON activity_comments;
CREATE TRIGGER activity_comments_notification_trigger
  AFTER INSERT ON activity_comments
  FOR EACH ROW EXECUTE FUNCTION notify_activity_comment();

DROP TRIGGER IF EXISTS follow_requests_notification_trigger ON follow_requests;
CREATE TRIGGER follow_requests_notification_trigger
  AFTER INSERT ON follow_requests
  FOR EACH ROW EXECUTE FUNCTION notify_follow_request();

DROP TRIGGER IF EXISTS follow_requests_update_notification_trigger ON follow_requests;
CREATE TRIGGER follow_requests_update_notification_trigger
  AFTER UPDATE ON follow_requests
  FOR EACH ROW EXECUTE FUNCTION notify_follow_request_update();

DROP TRIGGER IF EXISTS user_follows_notification_trigger ON user_follows;
CREATE TRIGGER user_follows_notification_trigger
  AFTER INSERT ON user_follows
  FOR EACH ROW EXECUTE FUNCTION notify_follow();

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

-- Activity feed emit + RPC
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
    INSERT INTO activity_cards (user_id, user_book_id, content, image_url, created_at)
    VALUES (NEW.user_id, NEW.id, action_text, book_cover, NEW.created_at);
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

    INSERT INTO activity_cards (user_id, user_book_id, content, image_url, created_at)
    VALUES (NEW.user_id, NEW.id, action_text, book_cover, NEW.updated_at);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_books_activity_trigger ON user_books;
CREATE TRIGGER user_books_activity_trigger
  AFTER INSERT OR UPDATE ON user_books
  FOR EACH ROW EXECUTE FUNCTION emit_activity_card_from_user_books();

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
      -- Prioritize finished sessions (finished_date NOT NULL) over unfinished ones
      CASE WHEN finished_date IS NOT NULL THEN 0 ELSE 1 END ASC,
      -- Among finished sessions, show most recent finished_date first
      COALESCE(finished_date, '1900-01-01'::date) DESC,
      -- Among unfinished sessions or as tie-breaker, use started_date
      COALESCE(started_date, '1900-01-01'::date) DESC,
      -- Final tie-breaker: most recent created_at
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
      -- Prioritize finished sessions (finished_date NOT NULL) over unfinished ones
      CASE WHEN finished_date IS NOT NULL THEN 0 ELSE 1 END ASC,
      -- Among finished sessions, show most recent finished_date first
      COALESCE(finished_date, '1900-01-01'::date) DESC,
      -- Among unfinished sessions or as tie-breaker, use started_date
      COALESCE(started_date, '1900-01-01'::date) DESC,
      -- Final tie-breaker: most recent created_at
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

-- User ranking functions
CREATE OR REPLACE FUNCTION update_user_books_count(user_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET books_read_count = (
    SELECT COUNT(*)
    FROM user_books
    WHERE user_id = user_uuid
    AND status = 'read'
  )
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_all_ranks()
RETURNS void AS $$
BEGIN
  WITH ranked_users AS (
    SELECT
      user_id,
      books_read_count,
      DENSE_RANK() OVER (ORDER BY books_read_count DESC, created_at ASC) as new_rank
    FROM user_profiles
    WHERE books_read_count > 0
  )
  UPDATE user_profiles
  SET global_rank = ranked_users.new_rank
  FROM ranked_users
  WHERE user_profiles.user_id = ranked_users.user_id;

  UPDATE user_profiles
  SET global_rank = NULL
  WHERE books_read_count = 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_update_user_rank()
RETURNS TRIGGER AS $$
DECLARE
  affected_user_id uuid;
  old_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_user_id := OLD.user_id;
    old_user_id := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    affected_user_id := NEW.user_id;
    old_user_id := OLD.user_id;
    IF NEW.user_id != OLD.user_id THEN
      PERFORM update_user_books_count(OLD.user_id);
    END IF;
  ELSE
    affected_user_id := NEW.user_id;
  END IF;

  PERFORM update_user_books_count(affected_user_id);
  PERFORM update_all_ranks();

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_rank_trigger ON user_books;
CREATE TRIGGER update_user_rank_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_books
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_user_rank();

CREATE OR REPLACE FUNCTION recalculate_all_ranks()
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET books_read_count = (
    SELECT COUNT(*)
    FROM user_books
    WHERE user_id = user_profiles.user_id
    AND status = 'read'
  );

  WITH ranked_users AS (
    SELECT
      user_id,
      books_read_count,
      DENSE_RANK() OVER (ORDER BY books_read_count DESC, created_at ASC) as rank
    FROM user_profiles
    WHERE books_read_count > 0
  )
  UPDATE user_profiles
  SET global_rank = ranked_users.rank
  FROM ranked_users
  WHERE user_profiles.user_id = ranked_users.user_id;

  UPDATE user_profiles
  SET global_rank = NULL
  WHERE books_read_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Weekly streak functions
CREATE OR REPLACE FUNCTION calculate_weekly_streak(user_uuid uuid)
RETURNS integer AS $$
DECLARE
  streak_count integer := 0;
  current_week_start date := date_trunc('week', now())::date;
  week_has_activity boolean;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM user_books
      WHERE user_id = user_uuid
      AND updated_at >= current_week_start
      AND updated_at < current_week_start + interval '7 days'
    ) INTO week_has_activity;

    IF week_has_activity THEN
      streak_count := streak_count + 1;
      current_week_start := current_week_start - interval '7 days';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN streak_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_weekly_streak(user_uuid uuid)
RETURNS void AS $$
DECLARE
  new_streak integer;
BEGIN
  new_streak := calculate_weekly_streak(user_uuid);
  UPDATE user_profiles
  SET weekly_streak = new_streak
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_update_weekly_streak()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_weekly_streak(NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_weekly_streak_trigger ON user_books;
CREATE TRIGGER update_weekly_streak_trigger
  AFTER INSERT OR UPDATE ON user_books
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_weekly_streak();

CREATE OR REPLACE FUNCTION backfill_all_weekly_streaks()
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET weekly_streak = calculate_weekly_streak(user_id);
END;
$$ LANGUAGE plpgsql;

-- Auth signup profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id,
    username,
    first_name,
    last_name,
    member_since,
    books_read_count,
    global_rank,
    reading_interests
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), 'User'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name', ''), ''),
    NOW(),
    0,
    NULL,
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'reading_interests')),
      '{}'::text[]
    )
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    username = EXCLUDED.username,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    reading_interests = EXCLUDED.reading_interests;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
