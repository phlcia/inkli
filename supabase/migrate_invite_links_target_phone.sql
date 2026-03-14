-- Migration: Add target_phone to invite_links for phone-based invite matching
-- When an inviter sends a link to a specific contact, store that contact's phone number.
-- At signup, if the new user's phone matches a pending invite, they are automatically linked
-- to the inviter — no deep link URL required.

ALTER TABLE invite_links
  ADD COLUMN IF NOT EXISTS target_phone TEXT NULL;

-- Partial index: only index rows that are pending and have a phone (the lookup case)
CREATE INDEX IF NOT EXISTS idx_invite_links_target_phone
  ON invite_links (target_phone)
  WHERE target_phone IS NOT NULL AND accepted_by IS NULL;
