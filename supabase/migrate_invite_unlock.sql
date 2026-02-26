-- Migration: Invite-to-Unlock feature
-- New tables: user_invites, user_unlocked_features
-- New columns on user_profiles, triggers, RPCs, RLS

-- 1. Add new columns to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_invites_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successful_invites_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unspent_invite_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grandfathered_invite_unlock BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_invite_code ON user_profiles(invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_invited_by ON user_profiles(invited_by_user_id) WHERE invited_by_user_id IS NOT NULL;

-- 2. New table user_invites
CREATE TABLE IF NOT EXISTS user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT NOT NULL,
  inviter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (inviter_user_id, invitee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_invites_invite_code ON user_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_user_invites_inviter ON user_invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_user_invites_invitee ON user_invites(invitee_user_id);

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invites" ON user_invites;
CREATE POLICY "Users can view own invites"
  ON user_invites
  FOR SELECT
  USING (
    (SELECT auth.uid()) = inviter_user_id
    OR (SELECT auth.uid()) = invitee_user_id
  );

-- No INSERT/UPDATE/DELETE policies: service role only via edge functions

-- 3. New table user_unlocked_features
CREATE TABLE IF NOT EXISTS user_unlocked_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_user_unlocked_features_user_id ON user_unlocked_features(user_id);

ALTER TABLE user_unlocked_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own unlocked features" ON user_unlocked_features;
CREATE POLICY "Users can view own unlocked features"
  ON user_unlocked_features
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- No INSERT/UPDATE/DELETE policies: service role only via edge functions

-- 4. Extend notifications type CHECK for invite_accepted
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'follow_request', 'follow_accept', 'follow_reject', 'invite_accepted'));

-- 5. Update handle_new_user to set invite_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
  new_invite_code TEXT;
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: increment_sent_invites_count (called after Share.share returns sharedAction)
CREATE OR REPLACE FUNCTION public.increment_sent_invites_count()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  UPDATE user_profiles
  SET sent_invites_count = sent_invites_count + 1
  WHERE user_id = auth.uid();
$$;

-- 7. RPC: recalculate_invite_points (admin/support only, not exposed to client)
CREATE OR REPLACE FUNCTION public.recalculate_invite_points(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  computed_points INTEGER;
BEGIN
  SELECT
    (SELECT successful_invites_count FROM user_profiles WHERE user_id = p_user_id)
    - (SELECT COUNT(*)::INTEGER FROM user_unlocked_features WHERE user_id = p_user_id)
  INTO computed_points;
  IF computed_points IS NOT NULL AND computed_points >= 0 THEN
    UPDATE user_profiles
    SET unspent_invite_points = computed_points
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- 8. Trigger: on_invite_accepted — credit inviter when invitee accepts
CREATE OR REPLACE FUNCTION public.on_invite_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.accepted_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL)) THEN
    UPDATE user_profiles
    SET successful_invites_count = successful_invites_count + 1,
        unspent_invite_points = unspent_invite_points + 1
    WHERE user_id = NEW.inviter_user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET row_security = off;

DROP TRIGGER IF EXISTS on_invite_accepted_trigger ON user_invites;
CREATE TRIGGER on_invite_accepted_trigger
  AFTER INSERT OR UPDATE ON user_invites
  FOR EACH ROW
  EXECUTE FUNCTION on_invite_accepted();

-- 9. Trigger: notify_invite_accepted — insert notification for inviter
CREATE OR REPLACE FUNCTION public.notify_invite_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.accepted_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL)) THEN
    INSERT INTO notifications (recipient_id, actor_id, type, created_at)
    VALUES (NEW.inviter_user_id, NEW.invitee_user_id, 'invite_accepted', NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET row_security = off;

DROP TRIGGER IF EXISTS notify_invite_accepted_trigger ON user_invites;
CREATE TRIGGER notify_invite_accepted_trigger
  AFTER INSERT OR UPDATE ON user_invites
  FOR EACH ROW
  EXECUTE FUNCTION notify_invite_accepted();

-- 10. Backfill invite_code for existing profiles (optional)
UPDATE user_profiles
SET invite_code = substr(md5(random()::text || id::text || gen_random_uuid()::text), 1, 10)
WHERE invite_code IS NULL;

-- 11. Grandfather existing users: they keep full access without the invite gate or unlock flow
UPDATE user_profiles
SET grandfathered_invite_unlock = true;
