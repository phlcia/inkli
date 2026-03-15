-- Add skipped_invite_gate flag to user_profiles.
-- Tracks whether the user has permanently skipped the invite gate onboarding step.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS skipped_invite_gate BOOLEAN NOT NULL DEFAULT false;
