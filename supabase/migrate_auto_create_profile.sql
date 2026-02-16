-- Migration: Auto-create user profile on auth signup
-- This trigger automatically creates a user profile when a new user signs up
-- Run this in your Supabase SQL Editor

-- Function to auto-create user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id,
    username,
    name,
    member_since,
    books_read_count,
    global_rank,
    reading_interests
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), 'User'),
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
    name = EXCLUDED.name,
    reading_interests = EXCLUDED.reading_interests;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

