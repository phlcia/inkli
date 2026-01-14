-- Migration: Fix profile photos storage RLS for upsert operations
-- This adds the UPDATE policy needed for upsert: true to work
-- Run this in your Supabase SQL Editor

-- Drop the policy if it already exists (idempotent)
DROP POLICY IF EXISTS "Users can update their own profile photos" ON storage.objects;

-- Policy 4: Allow users to update/replace their own profile photos (needed for upsert)
-- UPDATE policy:
--   name: "Users can update their own profile photos"
--   This allows replacing existing files with the same path (upsert: true)
CREATE POLICY "Users can update their own profile photos"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'profile-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Note: The folder structure is: {userId}/profile.{ext}
-- The policy checks that the first folder name matches the authenticated user's ID
-- This ensures users can only update their own profile photos
