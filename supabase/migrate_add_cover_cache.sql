-- Add cover caching metadata to books table

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_fetched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_books_isbn_cover
  ON public.books(isbn_13)
  WHERE cover_url IS NOT NULL;
