-- Migration: Lower mutual-friend gate from >= 2 to >= 1
-- Users with even a single mutual connection are now surfaced, ranked by mutual_count DESC
-- so strong matches (2+ mutuals) still appear first.

CREATE OR REPLACE FUNCTION get_recommended_users(
  p_user_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  username text,
  name text,
  mutual_count bigint,
  profile_photo_url text,
  account_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
  WITH second_degree AS (
    SELECT
      f2.following_id AS candidate_id
    FROM user_follows f1
    JOIN user_follows f2
      ON f1.following_id = f2.follower_id
    WHERE f1.follower_id = p_user_id
  )
  SELECT
    p.user_id,
    p.username,
    p.name,
    COUNT(*)::bigint AS mutual_count,
    p.profile_photo_url,
    p.account_type
  FROM second_degree sd
  JOIN user_profiles p
    ON p.user_id = sd.candidate_id
  WHERE
    sd.candidate_id != p_user_id
    -- Exclude users the current user already follows
    AND NOT EXISTS (
      SELECT 1
      FROM user_follows uf_existing
      WHERE uf_existing.follower_id = p_user_id
        AND uf_existing.following_id = sd.candidate_id
    )
    -- Exclude users with a pending follow request from the current user
    AND NOT EXISTS (
      SELECT 1
      FROM follow_requests fr
      WHERE fr.requester_id = p_user_id
        AND fr.requested_id = sd.candidate_id
        AND fr.status = 'pending'
    )
    -- Respect block and mute relationships
    AND NOT is_blocked_between(p_user_id, sd.candidate_id)
    AND NOT is_muted_between(p_user_id, sd.candidate_id)
    -- Respect profile visibility/privacy
    AND can_view_profile(p_user_id, sd.candidate_id) IS TRUE
  GROUP BY
    p.user_id,
    p.username,
    p.name,
    p.profile_photo_url,
    p.account_type
  HAVING COUNT(*) >= 1
  ORDER BY
    mutual_count DESC,
    p.username ASC
  LIMIT p_limit;
$$;
