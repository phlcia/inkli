-- Add completed_contact_discovery flag to user_profiles.
-- Tracks whether the user has gone through the contact discovery onboarding step.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS completed_contact_discovery BOOLEAN NOT NULL DEFAULT false;
