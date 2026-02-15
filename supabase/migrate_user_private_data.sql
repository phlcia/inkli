-- Migration: user_private_data table for email/phone (private contact info)
-- Run this in your Supabase SQL Editor
-- Order: create table, RLS, backfill, then trigger for new users

-- 1. Create table user_private_data
CREATE TABLE IF NOT EXISTS public.user_private_data (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone_number TEXT NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One phone per account; allow multiple NULLs (users without phone)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_private_data_phone_number
  ON public.user_private_data (phone_number)
  WHERE phone_number IS NOT NULL;

-- 2. RLS: only owner can SELECT and UPDATE; no client INSERT (trigger or auto-heal)
ALTER TABLE public.user_private_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own private data" ON public.user_private_data;
CREATE POLICY "Users can select own private data"
  ON public.user_private_data
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own private data" ON public.user_private_data;
CREATE POLICY "Users can update own private data"
  ON public.user_private_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow INSERT for auto-heal: owner can insert their own row if missing
DROP POLICY IF EXISTS "Users can insert own private data" ON public.user_private_data;
CREATE POLICY "Users can insert own private data"
  ON public.user_private_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. Backfill from auth.users in same migration (no gap)
INSERT INTO public.user_private_data (user_id, email, created_at, updated_at)
SELECT id, COALESCE(email, ''), created_at, NOW()
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 4. Trigger for new users: insert into user_private_data when auth.users row is created
CREATE OR REPLACE FUNCTION public.handle_new_user_private_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_private_data (user_id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Note: Supabase cloud may not allow triggers on auth.users. If this fails, use Database Webhooks to call an edge function that inserts into user_private_data.
DROP TRIGGER IF EXISTS on_auth_user_created_private_data ON auth.users;
CREATE TRIGGER on_auth_user_created_private_data
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_private_data();

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_private_data_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_private_data_updated_at ON public.user_private_data;
CREATE TRIGGER update_user_private_data_updated_at
  BEFORE UPDATE ON public.user_private_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_private_data_updated_at();
