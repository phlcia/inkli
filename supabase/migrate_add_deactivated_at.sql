-- Migration: Add deactivated_at for account deactivation (soft hide)
-- Deactivated profiles are hidden from others; reactivate on next login

-- 1. Add column
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Update can_view_profile to hide deactivated profiles from non-owners
CREATE OR REPLACE FUNCTION can_view_profile(p_viewer_id uuid, p_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  has_profile boolean;
  v_deactivated_at timestamptz;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NOT NULL AND p_viewer_id = p_owner_id THEN
    RETURN true;
  END IF;

  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_owner_id),
         (SELECT up.deactivated_at FROM user_profiles up WHERE up.user_id = p_owner_id LIMIT 1)
  INTO has_profile, v_deactivated_at;

  IF NOT has_profile THEN
    RETURN false;
  END IF;

  IF v_deactivated_at IS NOT NULL THEN
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

-- 3. Update can_view_content to hide content for deactivated users
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
  v_deactivated_at timestamptz;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NOT NULL AND p_viewer_id = p_owner_id THEN
    RETURN true;
  END IF;

  SELECT (account_type = 'public'), deactivated_at
  INTO is_public, v_deactivated_at
  FROM user_profiles
  WHERE user_id = p_owner_id;

  IF is_public IS NULL THEN
    RETURN false;
  END IF;

  IF v_deactivated_at IS NOT NULL THEN
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
