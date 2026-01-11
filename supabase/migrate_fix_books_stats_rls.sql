-- Ensure books_stats aggregation functions bypass RLS when called from triggers

CREATE OR REPLACE FUNCTION public.update_books_stats(book_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  avg_score NUMERIC(6,3);
  review_count INTEGER;
  shelf_read_count INTEGER;
  shelf_currently_reading_count INTEGER;
  shelf_want_to_read_count INTEGER;
BEGIN
  SELECT
    COALESCE(AVG(rank_score), NULL)::NUMERIC(6,3),
    COUNT(*) FILTER (WHERE rank_score IS NOT NULL)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'read')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'currently_reading')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'want_to_read')::INTEGER
  INTO avg_score,
       review_count,
       shelf_read_count,
       shelf_currently_reading_count,
       shelf_want_to_read_count
  FROM public.user_books
  WHERE book_id = book_id_param;

  INSERT INTO public.books_stats (
    book_id,
    global_avg_score,
    global_review_count,
    shelf_count_read,
    shelf_count_currently_reading,
    shelf_count_want_to_read,
    updated_at
  )
  VALUES (
    book_id_param,
    avg_score,
    COALESCE(review_count, 0),
    COALESCE(shelf_read_count, 0),
    COALESCE(shelf_currently_reading_count, 0),
    COALESCE(shelf_want_to_read_count, 0),
    NOW()
  )
  ON CONFLICT (book_id) DO UPDATE
  SET global_avg_score = EXCLUDED.global_avg_score,
      global_review_count = EXCLUDED.global_review_count,
      shelf_count_read = EXCLUDED.shelf_count_read,
      shelf_count_currently_reading = EXCLUDED.shelf_count_currently_reading,
      shelf_count_want_to_read = EXCLUDED.shelf_count_want_to_read,
      updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_update_books_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  affected_book_id UUID;
  affected_old_book_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_book_id := OLD.book_id;
    PERFORM public.update_books_stats(affected_book_id);
    RETURN OLD;
  END IF;

  affected_book_id := NEW.book_id;

  IF TG_OP = 'UPDATE' AND OLD.book_id IS DISTINCT FROM NEW.book_id THEN
    affected_old_book_id := OLD.book_id;
    PERFORM public.update_books_stats(affected_old_book_id);
  END IF;

  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND (
          OLD.status IS DISTINCT FROM NEW.status
          OR OLD.rank_score IS DISTINCT FROM NEW.rank_score
          OR OLD.book_id IS DISTINCT FROM NEW.book_id
        )) THEN
    PERFORM public.update_books_stats(affected_book_id);
  END IF;

  RETURN NEW;
END;
$$;
