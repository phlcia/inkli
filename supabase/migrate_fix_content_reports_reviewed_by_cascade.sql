-- Fix content_reports.reviewed_by FK to use ON DELETE SET NULL
-- Previously had no ON DELETE clause (defaults to RESTRICT), which blocks account deletion
-- if the user being deleted is referenced as a reviewer.

ALTER TABLE content_reports
  DROP CONSTRAINT IF EXISTS content_reports_reviewed_by_fkey;

ALTER TABLE content_reports
  ADD CONSTRAINT content_reports_reviewed_by_fkey
  FOREIGN KEY (reviewed_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;
