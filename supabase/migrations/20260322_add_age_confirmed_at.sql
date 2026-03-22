-- When the user completed in-app 13+ attestation (SignUpEmailScreen).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.age_confirmed_at IS
  'When the user completed in-app 13+ attestation (SignUpEmailScreen).';
