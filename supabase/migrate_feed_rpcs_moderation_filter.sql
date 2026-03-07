-- Migration: Exclude suspended/banned users from feed RPCs
-- get_followed_activity_cards and get_followed_user_books_activity already join user_profiles;
-- add filter so activity from suspended/banned users does not appear in followers' feeds.

-- Recreate get_followed_activity_cards with moderation_status filter
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
   AND (up.moderation_status IS NULL OR up.moderation_status NOT IN ('suspended', 'banned'))
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

-- Recreate get_followed_user_books_activity with moderation_status filter
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
   AND (up.moderation_status IS NULL OR up.moderation_status NOT IN ('suspended', 'banned'))
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
