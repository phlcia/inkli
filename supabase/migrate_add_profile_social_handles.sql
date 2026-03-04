-- Add Instagram and TikTok usernames to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS instagram_username TEXT;

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS tiktok_username TEXT;

