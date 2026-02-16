-- Fix: Deactivated profiles were still visible because a second SELECT policy
-- "Users can view public profile data" allowed ANY authenticated user to see ALL profiles.
-- RLS combines policies with OR, so it bypassed can_view_profile (which hides deactivated).
--
-- Drop the overly permissive policy so only can_view_profile controls visibility.
-- can_view_profile already returns false for deactivated profiles when viewer != owner.

DROP POLICY IF EXISTS "Users can view public profile data" ON user_profiles;
