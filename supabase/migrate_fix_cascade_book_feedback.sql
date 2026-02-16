-- Fix book_feedback.user_id to have ON DELETE CASCADE
-- Run the audit query first to verify; this fixes book_feedback which lacked CASCADE

ALTER TABLE book_feedback
  DROP CONSTRAINT IF EXISTS book_feedback_user_id_fkey;

ALTER TABLE book_feedback
  ADD CONSTRAINT book_feedback_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
