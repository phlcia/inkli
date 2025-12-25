-- Migration: Update user_profiles RLS to allow public read for member search
-- Run this migration to enable member search functionality

-- Drop existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

-- Create new policy: Anyone can read public profile fields for member search
CREATE POLICY "Anyone can view public profile fields"
  ON user_profiles
  FOR SELECT
  USING (true);

-- Note: We're not restricting which fields are visible at the database level
-- The application layer should filter out private fields (bio, reading_interests)
-- when displaying search results. The RLS allows reading all fields, but
-- the service layer should only return public fields for search results.

