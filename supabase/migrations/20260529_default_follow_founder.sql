-- Auto-follow the founder account for all new signups + backfill existing users.

DO $$
DECLARE
  founder_user_id UUID;
  founder_username CONSTANT TEXT := 'phylicia';
BEGIN
  SELECT user_id
  INTO founder_user_id
  FROM public.user_profiles
  WHERE username = founder_username
  LIMIT 1;

  IF founder_user_id IS NULL THEN
    RAISE EXCEPTION 'Founder account not found for username: %', founder_username;
  END IF;

  ALTER TABLE public.user_follows DISABLE TRIGGER user_follows_notification_trigger;

  INSERT INTO public.user_follows (follower_id, following_id)
  SELECT up.user_id, founder_user_id
  FROM public.user_profiles up
  WHERE up.user_id <> founder_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_follows uf
      WHERE uf.follower_id = up.user_id
        AND uf.following_id = founder_user_id
    );

  ALTER TABLE public.user_follows ENABLE TRIGGER user_follows_notification_trigger;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  user_name TEXT;
  new_invite_code TEXT;
  founder_user_id UUID;
  founder_username CONSTANT TEXT := 'phlcia';
BEGIN
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

  new_invite_code := substr(md5(random()::text || gen_random_uuid()::text), 1, 10);

  INSERT INTO public.user_profiles (
    user_id,
    username,
    name,
    member_since,
    books_read_count,
    global_rank,
    reading_interests,
    invite_code,
    sent_invites_count,
    successful_invites_count,
    unspent_invite_points
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
    ),
    new_invite_code,
    0,
    0,
    0
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    username = EXCLUDED.username,
    name = EXCLUDED.name,
    reading_interests = EXCLUDED.reading_interests;

  SELECT user_id
  INTO founder_user_id
  FROM public.user_profiles
  WHERE username = founder_username
  LIMIT 1;

  IF founder_user_id IS NOT NULL AND NEW.id <> founder_user_id THEN
    ALTER TABLE public.user_follows DISABLE TRIGGER user_follows_notification_trigger;

    INSERT INTO public.user_follows (follower_id, following_id)
    VALUES (NEW.id, founder_user_id)
    ON CONFLICT DO NOTHING;

    ALTER TABLE public.user_follows ENABLE TRIGGER user_follows_notification_trigger;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
