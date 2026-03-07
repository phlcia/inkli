-- Admin: Pending Reports (save as a view or run in Supabase Dashboard SQL Editor)
-- Use this to review pending content reports. Run with a role that can read content_reports and joined tables.

SELECT
  cr.id,
  cr.reporter_id,
  cr.target_type,
  cr.target_id,
  cr.reason,
  cr.details,
  cr.status,
  cr.created_at,
  reporter.username AS reporter_username,
  CASE cr.target_type
    WHEN 'comment' THEN (SELECT comment_text FROM activity_comments WHERE id = cr.target_id LIMIT 1)
    WHEN 'user' THEN (SELECT username FROM user_profiles WHERE user_id = cr.target_id LIMIT 1)
    WHEN 'user_book' THEN (SELECT b.title FROM user_books ub JOIN books b ON b.id = ub.book_id WHERE ub.id = cr.target_id LIMIT 1)
    ELSE NULL
  END AS target_preview
FROM content_reports cr
JOIN user_profiles reporter ON reporter.user_id = cr.reporter_id
WHERE cr.status = 'pending'
ORDER BY cr.created_at ASC;
