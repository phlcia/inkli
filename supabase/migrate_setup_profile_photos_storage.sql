-- Migration: Setup Supabase Storage for profile photos
-- Run this in your Supabase SQL Editor

-- Create storage bucket for profile photos (if it doesn't exist)
-- Note: Bucket creation must be done via Supabase Dashboard or API
-- This SQL file documents the required setup

-- Storage bucket name: profile-photos
-- Bucket should be configured as:
--   - Public: true (for public read access)
--   - File size limit: 5MB (recommended)
--   - Allowed MIME types: image/jpeg, image/png, image/webp

-- Storage policies (RLS for storage):
-- Policy 1: Allow authenticated users to upload their own profile photos
-- INSERT policy:
--   name: "Users can upload their own profile photos"
--   check: bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]

-- Policy 2: Allow public read access to profile photos
-- SELECT policy:
--   name: "Public can read profile photos"
--   check: bucket_id = 'profile-photos'

-- Policy 3: Allow users to delete their own profile photos
-- DELETE policy:
--   name: "Users can delete their own profile photos"
--   check: bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]

-- Note: The folder structure will be: profile-photos/{user_id}-{timestamp}.{ext}
-- This allows easy identification of photo ownership
