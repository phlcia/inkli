-- Migration: Replace first_name + last_name with single name column
-- Run this in Supabase SQL Editor after deploying code that uses "name"

-- 1. Add new name column (nullable initially for backfill)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. Backfill: concatenate first_name + last_name into name
UPDATE user_profiles
SET name = TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))
WHERE name IS NULL OR name = '';

-- 3. Set default for any still-empty names
UPDATE user_profiles SET name = COALESCE(NULLIF(TRIM(name), ''), 'User') WHERE name IS NULL OR TRIM(name) = '';

-- 4. Make name NOT NULL
ALTER TABLE user_profiles ALTER COLUMN name SET NOT NULL;

-- 5. Drop old columns
ALTER TABLE user_profiles DROP COLUMN IF EXISTS first_name;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS last_name;

-- 6. Update handle_new_user to use name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
BEGIN
  -- Prefer 'name', then full_name, then first_name + last_name for backwards compat
  user_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    TRIM(CONCAT(
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      ' ',
      COALESCE(NEW.raw_user_meta_data->>'last_name', '')
    )),
    'User'
  );
  IF user_name = '' THEN
    user_name := 'User';
  END IF;

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
    user_name,
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
