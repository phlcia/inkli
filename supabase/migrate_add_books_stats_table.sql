-- Aggregate stats for book rankings (global)

CREATE TABLE IF NOT EXISTS public.books_stats (
  book_id UUID PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
  global_avg_score NUMERIC(6,3) DEFAULT NULL,
  global_review_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.books_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read books_stats" ON public.books_stats;
CREATE POLICY "Anyone can read books_stats"
  ON public.books_stats
  FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_books_stats_updated_at ON public.books_stats(updated_at);

CREATE INDEX IF NOT EXISTS idx_user_books_book_rank_score
  ON public.user_books(book_id, rank_score)
  WHERE rank_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_books_book_user_rank_score
  ON public.user_books(book_id, user_id, rank_score)
  WHERE rank_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_follows_follower_following
  ON public.user_follows(follower_id, following_id);

CREATE OR REPLACE FUNCTION public.update_books_stats(book_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  avg_score NUMERIC(6,3);
  review_count INTEGER;
BEGIN
  SELECT
    COALESCE(AVG(rank_score), NULL)::NUMERIC(6,3),
    COUNT(*)
  INTO avg_score, review_count
  FROM public.user_books
  WHERE book_id = book_id_param
    AND rank_score IS NOT NULL;

  INSERT INTO public.books_stats (book_id, global_avg_score, global_review_count, updated_at)
  VALUES (book_id_param, avg_score, review_count, NOW())
  ON CONFLICT (book_id) DO UPDATE
  SET global_avg_score = EXCLUDED.global_avg_score,
      global_review_count = EXCLUDED.global_review_count,
      updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_update_books_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  affected_book_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_book_id := OLD.book_id;
  ELSE
    affected_book_id := NEW.book_id;
  END IF;

  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND (OLD.rank_score IS DISTINCT FROM NEW.rank_score))
     OR TG_OP = 'DELETE' THEN
    PERFORM public.update_books_stats(affected_book_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_books_stats_trigger ON public.user_books;
CREATE TRIGGER update_books_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.user_books
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_books_stats();

CREATE OR REPLACE FUNCTION public.get_friends_book_stats(
  p_book_id UUID,
  p_friend_ids UUID[]
)
RETURNS TABLE (
  avg_score NUMERIC(6,3),
  review_count INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    COALESCE(AVG(ub.rank_score), NULL)::NUMERIC(6,3) AS avg_score,
    COUNT(*)::INTEGER AS review_count
  FROM public.user_books ub
  WHERE ub.book_id = p_book_id
    AND ub.rank_score IS NOT NULL
    AND ub.user_id = ANY(p_friend_ids);
$$;
