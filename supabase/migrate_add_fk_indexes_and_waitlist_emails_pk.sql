-- Add missing FK indexes and primary key for waitlist_emails

-- Missing FK indexes
CREATE INDEX IF NOT EXISTS idx_activity_comments_parent_comment_id
  ON public.activity_comments(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_book_genres_genre_id
  ON public.book_genres(genre_id);

CREATE INDEX IF NOT EXISTS idx_book_themes_theme_id
  ON public.book_themes(theme_id);

CREATE INDEX IF NOT EXISTS idx_comparisons_loser_book_id
  ON public.comparisons(loser_book_id);

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id
  ON public.notifications(comment_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_book_id
  ON public.notifications(user_book_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_book_id
  ON public.recommendations(book_id);

CREATE INDEX IF NOT EXISTS idx_unmapped_genres_log_book_id
  ON public.unmapped_genres_log(book_id);

-- Ensure waitlist_emails has a primary key (if table exists)
DO $$
BEGIN
  IF to_regclass('public.waitlist_emails') IS NOT NULL THEN
    ALTER TABLE public.waitlist_emails
      ADD COLUMN IF NOT EXISTS id uuid;

    UPDATE public.waitlist_emails
      SET id = gen_random_uuid()
      WHERE id IS NULL;

    ALTER TABLE public.waitlist_emails
      ALTER COLUMN id SET DEFAULT gen_random_uuid();

    ALTER TABLE public.waitlist_emails
      ALTER COLUMN id SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.waitlist_emails'::regclass
        AND contype = 'p'
    ) THEN
      ALTER TABLE public.waitlist_emails
        ADD CONSTRAINT waitlist_emails_pkey PRIMARY KEY (id);
    END IF;
  END IF;
END $$;
