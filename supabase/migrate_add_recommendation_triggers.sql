-- Migration: Add recommendation trigger helpers

CREATE OR REPLACE FUNCTION increment_rankings_counter(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE user_profiles
  SET rankings_since_last_refresh = rankings_since_last_refresh + 1
  WHERE user_profiles.user_id = increment_rankings_counter.user_id
    AND user_profiles.user_id = auth.uid();
END;
$$;
