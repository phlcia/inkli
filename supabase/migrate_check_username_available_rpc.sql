-- Migration: Add check_username_available RPC for signup flow
-- Anonymous users cannot read user_profiles due to RLS (can_view_profile returns false when auth.uid() is null).
-- This RPC runs as SECURITY DEFINER to bypass RLS, allowing username availability checks during signup.

CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE LOWER(username) = LOWER(trim(p_username))
    LIMIT 1
  );
$$;
