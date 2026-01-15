-- Migration: Remove old started_date and finished_date columns from user_books
-- RUN THIS ONLY AFTER VERIFYING DATA MIGRATION
--
-- VERIFICATION STEP (run manually before this migration):
-- SELECT COUNT(*) FROM user_books WHERE started_date IS NOT NULL OR finished_date IS NOT NULL;
-- SELECT COUNT(*) FROM user_book_read_sessions;
-- These counts should match!
--
-- If counts don't match, DO NOT run this migration. Investigate the discrepancy first.

-- Remove old columns
ALTER TABLE user_books 
  DROP COLUMN IF EXISTS started_date,
  DROP COLUMN IF EXISTS finished_date;
