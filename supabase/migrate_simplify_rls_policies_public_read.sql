-- Simplify RLS policies to one read policy per table and fix auth initplan warnings

-- books: keep single public read policy, drop redundant/deny policies
DROP POLICY IF EXISTS "Books are publicly readable" ON public.books;
DROP POLICY IF EXISTS "Users can read books" ON public.books;
DROP POLICY IF EXISTS "No one can delete books" ON public.books;
DROP POLICY IF EXISTS "No one can update books" ON public.books;

-- comparisons: keep public read, remove redundant read-own, fix initplan
DROP POLICY IF EXISTS "Users can read own comparisons" ON public.comparisons;
ALTER POLICY "Users can insert own comparisons"
  ON public.comparisons
  WITH CHECK ((select auth.uid()) = user_id);

-- user_books: keep manage-own for writes, keep single public read policy
DROP POLICY IF EXISTS "Users can delete own books" ON public.user_books;
DROP POLICY IF EXISTS "Users can insert own books" ON public.user_books;
DROP POLICY IF EXISTS "Users can update own books" ON public.user_books;
DROP POLICY IF EXISTS "Users can view own books" ON public.user_books;
DROP POLICY IF EXISTS "Users can read activity" ON public.user_books;
DROP POLICY IF EXISTS "Users can read shelves" ON public.user_books;
DROP POLICY IF EXISTS "Users can manage their own user books" ON public.user_books;
ALTER POLICY "User books are readable by viewers"
  ON public.user_books
  USING (can_view_content((select auth.uid()), user_id));
CREATE POLICY "Users can insert their own user books"
  ON public.user_books
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update their own user books"
  ON public.user_books
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete their own user books"
  ON public.user_books
  FOR DELETE
  USING ((select auth.uid()) = user_id);

-- user_profiles: keep privacy-aware read policy, fix initplan on update
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_profiles;
ALTER POLICY "Anyone can view public profile fields"
  ON public.user_profiles
  USING (can_view_profile((select auth.uid()), user_id));
ALTER POLICY "Users can view public profile data"
  ON public.user_profiles
  USING ((select auth.role()) = 'authenticated');
ALTER POLICY "users can update profile"
  ON public.user_profiles
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- filter_events: fix initplan
ALTER POLICY "Users can insert own filter events"
  ON public.filter_events
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can read own filter events"
  ON public.filter_events
  USING ((select auth.uid()) = user_id);

-- unmapped_genres_log: fix initplan
ALTER POLICY "Authenticated users can read unmapped genre logs"
  ON public.unmapped_genres_log
  USING ((select auth.role()) = 'authenticated');

-- user_book_read_sessions: fix initplan
ALTER POLICY "Users can insert their own read sessions"
  ON public.user_book_read_sessions
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_books
      WHERE user_books.id = user_book_read_sessions.user_book_id
        AND user_books.user_id = (select auth.uid())
    )
  );
ALTER POLICY "Users can update their own read sessions"
  ON public.user_book_read_sessions
  USING (
    EXISTS (
      SELECT 1
      FROM user_books
      WHERE user_books.id = user_book_read_sessions.user_book_id
        AND user_books.user_id = (select auth.uid())
    )
  );
ALTER POLICY "Users can delete their own read sessions"
  ON public.user_book_read_sessions
  USING (
    EXISTS (
      SELECT 1
      FROM user_books
      WHERE user_books.id = user_book_read_sessions.user_book_id
        AND user_books.user_id = (select auth.uid())
    )
  );
