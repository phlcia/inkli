-- Lock down public.books writes and add uniqueness constraints for safe upserts

drop index if exists public.books_open_library_id_key;

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'books'
      AND cmd IN ('insert', 'update', 'delete')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.books', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Anyone can read books" ON public.books;
CREATE POLICY "Anyone can read books"
  ON public.books
  FOR SELECT
  USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'books_open_library_id_key'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_open_library_id_key UNIQUE (open_library_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'books_google_books_id_key'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.books
      WHERE google_books_id IS NOT NULL
      GROUP BY google_books_id
      HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE public.books
        ADD CONSTRAINT books_google_books_id_key UNIQUE (google_books_id);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'books_isbn_13_key'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.books
      WHERE isbn_13 IS NOT NULL
      GROUP BY isbn_13
      HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE public.books
        ADD CONSTRAINT books_isbn_13_key UNIQUE (isbn_13);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'books'
      AND column_name = 'open_library_id'
      AND is_nullable = 'YES'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.books WHERE open_library_id IS NULL
    ) THEN
      ALTER TABLE public.books
        ALTER COLUMN open_library_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- select c.relkind, c.relname
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname='public' and c.relname='books_open_library_id_key';