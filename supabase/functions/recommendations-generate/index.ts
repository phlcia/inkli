// Supabase Edge Function: Generate content-based recommendations
// Analyzes user's comparison history to recommend books based on genre/theme preferences
// Auth required: valid JWT in Authorization header

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: {
    get: (key: string) => string | undefined
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type SupabaseClient = ReturnType<typeof createClient>;
type GenreJoinRow = { genres?: { name?: string | null } | null };
type ThemeJoinRow = { themes?: { name?: string | null } | null };
type BookIdRow = { id: string };
type ShelfBookRow = {
  book_id: string;
  rating: string | null;
  created_at: string | null;
  status: string | null;
  book?: { authors?: string[] | null } | null;
};

interface BookScore {
  book_id: string;
  score: number;
  reasoning: string;
}

interface OpenLibraryWorkData {
  title: string;
  authors?: Array<{ author: { key: string } }>;
  covers?: number[];
  description?: string | { value: string };
  first_publish_date?: string;
}

function daysSince(dateString: string | null): number {
  if (!dateString) return Number.POSITIVE_INFINITY;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function getRecencyWeight(createdAt: string | null): number {
  const daysAgo = daysSince(createdAt);
  if (daysAgo <= 30) return 1.5;
  if (daysAgo <= 90) return 1.2;
  return 1.0;
}

function getRatingWeight(rating: string | null): number {
  switch (rating) {
    case 'liked':
      return 1.2;
    case 'fine':
      return 0.5;
    case 'disliked':
      return -0.8;
    default:
      return 0;
  }
}

function ensureSmartDiversity(
  scores: BookScore[],
  books: Array<{ id: string; authors?: string[] | null }>,
  genreMap: Map<string, string[]>,
  targetCount: number
): BookScore[] {
  const diverse: BookScore[] = [];
  const authorCount = new Map<string, number>();
  const genreCount = new Map<string, number>();
  const includedIds = new Set<string>();
  const bookById = new Map(books.map((book) => [book.id, book]));

  for (const score of scores) {
    const book = bookById.get(score.book_id);
    if (!book) continue;

    const firstAuthor =
      book.authors && book.authors.length > 0 ? book.authors[0].toLowerCase() : 'unknown';
    const primaryGenre = genreMap.get(book.id)?.[0];
    const authorBooks = authorCount.get(firstAuthor) || 0;
    const genreBooks = primaryGenre ? genreCount.get(primaryGenre) || 0 : 0;

    const maxPerAuthor = diverse.length < 10 ? 1 : 2;
    const maxPerGenre = diverse.length < 10 ? 3 : 5;

    if (authorBooks < maxPerAuthor && (!primaryGenre || genreBooks < maxPerGenre)) {
      diverse.push(score);
      includedIds.add(score.book_id);
      authorCount.set(firstAuthor, authorBooks + 1);
      if (primaryGenre) {
        genreCount.set(primaryGenre, genreBooks + 1);
      }

      if (diverse.length >= targetCount) break;
    }
  }

  if (diverse.length < targetCount) {
    const remaining = scores
      .filter((score) => !includedIds.has(score.book_id))
      .slice(0, targetCount - diverse.length);
    diverse.push(...remaining);
  }

  return diverse;
}

async function fetchAndInsertBookFromOpenLibrary(
  workId: string,
  supabaseDb: SupabaseClient
): Promise<boolean> {
  try {
    const response = await fetch(`https://openlibrary.org/works/${workId}.json`);
    if (!response.ok) {
      console.error(`Failed to fetch work ${workId}: ${response.status}`);
      return false;
    }

    const workData: OpenLibraryWorkData = await response.json();

    const authorNames: string[] = [];
    if (workData.authors && workData.authors.length > 0) {
      for (const authorRef of workData.authors.slice(0, 3)) {
        try {
          const authorKey = authorRef.author.key;
          const authorResponse = await fetch(`https://openlibrary.org${authorKey}.json`);
          if (authorResponse.ok) {
            const authorData = await authorResponse.json();
            if (authorData.name) {
              authorNames.push(authorData.name);
            }
          }
        } catch (error) {
          console.error('Error fetching author:', error);
        }
      }
    }

    let coverUrl: string | null = null;
    if (workData.covers && workData.covers.length > 0) {
      coverUrl = `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`;
    }

    let description: string | null = null;
    if (workData.description) {
      description =
        typeof workData.description === 'string'
          ? workData.description
          : workData.description.value;
    }

    let publishedYear: number | null = null;
    if (workData.first_publish_date) {
      const yearMatch = workData.first_publish_date.match(/\d{4}/);
      if (yearMatch) {
        publishedYear = parseInt(yearMatch[0], 10);
      }
    }

    const { error: insertError } = await supabaseDb.from('books').insert({
      id: workId,
      title: workData.title,
      authors: authorNames.length > 0 ? authorNames : ['Unknown'],
      cover_url: coverUrl,
      description: description,
      published_year: publishedYear,
      language: 'en',
    });

    if (insertError) {
      console.error(`Failed to insert book ${workId}:`, insertError.message);
      return false;
    }

    console.log(`Auto-populated book: ${workData.title} (${workId})`);
    return true;
  } catch (error) {
    console.error(`Error auto-populating book ${workId}:`, error);
    return false;
  }
}

async function ensureBooksExist(
  bookIds: string[],
  supabaseDb: SupabaseClient
): Promise<void> {
  if (bookIds.length === 0) return;

  const { data: existingBooks } = await supabaseDb
    .from('books')
    .select('id')
    .in('id', bookIds);

  const existingIds = new Set((existingBooks as BookIdRow[] | null || []).map((b) => b.id));
  const missingIds = bookIds.filter((id) => !existingIds.has(id));

  if (missingIds.length === 0) {
    return;
  }

  console.log(`Auto-populating ${missingIds.length} missing books...`);
  for (const bookId of missingIds) {
    await fetchAndInsertBookFromOpenLibrary(bookId, supabaseDb);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const supabaseDb = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabaseAuth

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const algorithmVersion = 'v2'

    const persistRecommendations = async (
      recommendations: Array<{ book_id: string; score: number; reasoning: string }>
    ) => {
      const createdAt = new Date().toISOString()

      const { error: deleteError } = await supabaseDb
        .from('recommendations')
        .delete()
        .eq('user_id', user.id)

      if (deleteError) {
        throw new Error(`Failed to clear recommendations: ${deleteError.message}`)
      }

      if (recommendations.length > 0) {
        const { error: insertError } = await supabaseDb
          .from('recommendations')
          .insert(
            recommendations.map((rec) => ({
              user_id: user.id,
              book_id: rec.book_id,
              score: rec.score,
              reason: rec.reasoning,
              algorithm_version: algorithmVersion,
              created_at: createdAt,
            }))
          )

        if (insertError) {
          throw new Error(`Failed to insert recommendations: ${insertError.message}`)
        }
      }

      const { data: stored, error: fetchError } = await supabaseDb
        .from('recommendations')
        .select(
          `
          id,
          book_id,
          score,
          reason,
          algorithm_version,
          created_at,
          shown_at,
          clicked_at,
          book:books (
            id,
            title,
            authors,
            cover_url,
            open_library_id,
            isbn_10,
            isbn_13
          )
        `
        )
        .eq('user_id', user.id)
        .order('score', { ascending: false })
        .limit(20)

      if (fetchError) {
        throw new Error(`Failed to fetch stored recommendations: ${fetchError.message}`)
      }

      return (stored || []).map((rec) => ({
        id: rec.id,
        book_id: rec.book_id,
        book: rec.book || null,
        reasoning: rec.reason || 'Recommended for you',
        score: rec.score,
        algorithm_version: rec.algorithm_version,
        created_at: rec.created_at,
        shown_at: rec.shown_at,
        clicked_at: rec.clicked_at,
      }))
    }

    // Get user's comparison history
    const { data: comparisons, error: comparisonsError } = await supabaseDb
      .from('comparisons')
      .select('winner_book_id, loser_book_id')
      .eq('user_id', user.id)

    if (comparisonsError) {
      throw new Error(`Failed to fetch comparisons: ${comparisonsError.message}`)
    }

    const userComparisons = comparisons || []

    // Get shelf data for preferences
    const { data: shelfBooks, error: shelfError } = await supabaseDb
      .from('user_books')
      .select('book_id, rating, created_at, status, book:books(authors)')
      .eq('user_id', user.id)
      .in('status', ['read', 'currently_reading'])

    if (shelfError) {
      throw new Error(`Failed to fetch shelf data: ${shelfError.message}`)
    }

    const shelfRows = (shelfBooks || []) as ShelfBookRow[]
    const shelfBookIds = shelfRows.map((row) => row.book_id).filter(Boolean)

    const shelfGenreMap = new Map<string, string[]>()
    const shelfThemeMap = new Map<string, string[]>()

    if (shelfBookIds.length > 0) {
      const { data: shelfGenres } = await supabaseDb
        .from('book_genres')
        .select('book_id, genres!inner(name)')
        .in('book_id', shelfBookIds)

      const { data: shelfThemes } = await supabaseDb
        .from('book_themes')
        .select('book_id, themes!inner(name)')
        .in('book_id', shelfBookIds)

      if (shelfGenres) {
        const shelfGenreRows = shelfGenres as Array<{ book_id: string; genres?: { name?: string | null } | null }>
        for (const row of shelfGenreRows) {
          const genreName = row.genres?.name
          if (!genreName) continue
          const current = shelfGenreMap.get(row.book_id) || []
          current.push(genreName)
          shelfGenreMap.set(row.book_id, current)
        }
      }

      if (shelfThemes) {
        const shelfThemeRows = shelfThemes as Array<{ book_id: string; themes?: { name?: string | null } | null }>
        for (const row of shelfThemeRows) {
          const themeName = row.themes?.name
          if (!themeName) continue
          const current = shelfThemeMap.get(row.book_id) || []
          current.push(themeName)
          shelfThemeMap.set(row.book_id, current)
        }
      }
    }

    // Fetch friends' liked books for social signal
    const { data: followsData } = await supabaseDb
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const friendIds = (followsData || []).map((r: { following_id: string }) => r.following_id)
    const friendLikedMap = new Map<string, number>() // book_id -> count of friends who liked it

    if (friendIds.length > 0) {
      const { data: friendBooks } = await supabaseDb
        .from('user_books')
        .select('book_id')
        .in('user_id', friendIds)
        .eq('rating', 'liked')
        .eq('status', 'read')

      for (const row of (friendBooks || []) as Array<{ book_id: string }>) {
        friendLikedMap.set(row.book_id, (friendLikedMap.get(row.book_id) || 0) + 1)
      }
    }

    const totalFriends = Math.max(friendIds.length, 1)

    // If user has <5 comparisons and minimal shelf data, return popular books
    if (userComparisons.length < 5 && shelfRows.length < 3) {
      // Calculate which books user has seen frequently (5+ times)
      const bookStats = new Map<string, { wins: number; total: number }>()
      for (const comp of userComparisons) {
        const winnerStats = bookStats.get(comp.winner_book_id) || { wins: 0, total: 0 }
        winnerStats.wins++
        winnerStats.total++
        bookStats.set(comp.winner_book_id, winnerStats)

        const loserStats = bookStats.get(comp.loser_book_id) || { wins: 0, total: 0 }
        loserStats.total++
        bookStats.set(comp.loser_book_id, loserStats)
      }

      const frequentlySeenBooks = Array.from(bookStats.entries())
        .filter(([_, stats]) => stats.total >= 5)
        .map(([id]) => id)

      let popularQuery = supabaseDb
        .from('books')
        .select(`
          id,
          title,
          authors,
          cover_url,
          global_win_rate,
          total_comparisons,
          is_starter_book
        `)
        .order('is_starter_book', { ascending: false, nullsLast: true })
        .order('global_win_rate', { ascending: false, nullsLast: true })
        .order('total_comparisons', { ascending: false })
        .limit(30)

      if (frequentlySeenBooks.length > 0) {
        popularQuery = popularQuery.not('id', 'in', `(${frequentlySeenBooks.join(',')})`)
      }

      const { data: popularBooks, error: popularError } = await popularQuery

      if (popularError) {
        throw new Error(`Failed to fetch popular books: ${popularError.message}`)
      }

      const recommendations = (popularBooks || []).map(book => ({
        book_id: book.id,
        book: {
          id: book.id,
          title: book.title,
          authors: book.authors,
          cover_url: book.cover_url,
          open_library_id: book.open_library_id || null,
          isbn_10: book.isbn_10 || null,
          isbn_13: book.isbn_13 || null,
        },
        reasoning: 'Popular book',
        score: (book.global_win_rate || 0) * (book.total_comparisons || 0),
      }))

      const storedRecommendations = await persistRecommendations(
        recommendations.map((rec) => ({
          book_id: rec.book_id,
          score: rec.score,
          reasoning: rec.reasoning,
        }))
      )

      return new Response(
        JSON.stringify({ recommendations: storedRecommendations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate win rate per book using all comparison data
    const bookStats = new Map<string, { wins: number; total: number }>()

    for (const comp of userComparisons) {
      const winnerStats = bookStats.get(comp.winner_book_id) || { wins: 0, total: 0 }
      winnerStats.wins++
      winnerStats.total++
      bookStats.set(comp.winner_book_id, winnerStats)

      const loserStats = bookStats.get(comp.loser_book_id) || { wins: 0, total: 0 }
      loserStats.total++
      bookStats.set(comp.loser_book_id, loserStats)
    }

    // FIX 1/5: Batch fetch genres/themes for ALL comparison books (2 queries instead of 4)
    const allComparisonBookIds = Array.from(bookStats.keys())

    const { data: compGenresData } = await supabaseDb
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', allComparisonBookIds.length > 0 ? allComparisonBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: compThemesData } = await supabaseDb
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', allComparisonBookIds.length > 0 ? allComparisonBookIds : ['00000000-0000-0000-0000-000000000000'])

    const compGenreMap = new Map<string, string[]>()
    const compThemeMap = new Map<string, string[]>()

    if (compGenresData) {
      for (const row of compGenresData as Array<{ book_id: string; genres?: { name?: string | null } | null }>) {
        const genreName = row.genres?.name
        if (!genreName) continue
        const current = compGenreMap.get(row.book_id) || []
        current.push(genreName)
        compGenreMap.set(row.book_id, current)
      }
    }

    if (compThemesData) {
      for (const row of compThemesData as Array<{ book_id: string; themes?: { name?: string | null } | null }>) {
        const themeName = row.themes?.name
        if (!themeName) continue
        const current = compThemeMap.get(row.book_id) || []
        current.push(themeName)
        compThemeMap.set(row.book_id, current)
      }
    }

    // FIX 5/5: Build preference vectors using win rate magnitude instead of flat +1/-1
    const genrePreferences = new Map<string, number>()
    const themePreferences = new Map<string, number>()
    // FIX 3/5: Track actual book exposure count separately from preference score
    const genreExposureCount = new Map<string, number>()
    const authorPreferences = new Set<string>()

    for (const [bookId, stats] of bookStats.entries()) {
      const winRate = stats.total > 0 ? stats.wins / stats.total : 0
      // Confidence dampener: books with fewer comparisons contribute less
      const confidence = Math.min(stats.total / 5, 1)
      // Signal: 100% win rate = +1, 50% = 0, 0% = -1
      const signal = (winRate - 0.5) * 2 * confidence

      for (const genreName of compGenreMap.get(bookId) || []) {
        genrePreferences.set(genreName, (genrePreferences.get(genreName) || 0) + signal)
        if (winRate >= 0.5 && stats.total >= 2) {
          genreExposureCount.set(genreName, (genreExposureCount.get(genreName) || 0) + 1)
        }
      }

      for (const themeName of compThemeMap.get(bookId) || []) {
        themePreferences.set(themeName, (themePreferences.get(themeName) || 0) + signal)
      }
    }

    // Add shelf signals (rating + recency)
    for (const row of shelfRows) {
      const ratingWeight = getRatingWeight(row.rating)
      if (ratingWeight === 0) continue
      const recencyWeight = getRecencyWeight(row.created_at)
      const totalWeight = ratingWeight * recencyWeight

      const shelfGenres = shelfGenreMap.get(row.book_id) || []
      for (const genreName of shelfGenres) {
        genrePreferences.set(genreName, (genrePreferences.get(genreName) || 0) + totalWeight)
        if (row.rating === 'liked') {
          genreExposureCount.set(genreName, (genreExposureCount.get(genreName) || 0) + 1)
        }
      }

      const shelfThemes = shelfThemeMap.get(row.book_id) || []
      for (const themeName of shelfThemes) {
        themePreferences.set(themeName, (themePreferences.get(themeName) || 0) + totalWeight)
      }

      if (row.book?.authors) {
        for (const author of row.book.authors) {
          authorPreferences.add(author)
        }
      }
    }

    // FIX 2/5: Exclude books user really disliked AND books already on their shelf
    const reallyDislikedBookIds = new Set<string>()
    for (const [bookId, stats] of bookStats.entries()) {
      const winRate = stats.total > 0 ? stats.wins / stats.total : 0
      if (winRate < 0.3 && stats.total >= 3) {
        reallyDislikedBookIds.add(bookId)
      }
    }

    const excludedBookIds = new Set([
      ...Array.from(reallyDislikedBookIds),
      ...shelfBookIds,
    ])

    let allBooksQuery = supabaseDb
      .from('books')
      .select('id, title, authors, cover_url, open_library_id, isbn_10, isbn_13, total_comparisons')
      .limit(1000)

    if (excludedBookIds.size > 0) {
      allBooksQuery = allBooksQuery.not('id', 'in', `(${Array.from(excludedBookIds).join(',')})`)
    }

    const { data: allBooks, error: allBooksError } = await allBooksQuery
    if (allBooksError) {
      throw new Error(`Failed to fetch books: ${allBooksError.message}`)
    }

    // FIX 1/5: Batch fetch genres/themes for all candidate books (was 2 queries per book before)
    const allCandidateIds = (allBooks || []).map(b => b.id)

    const { data: allCandidateGenres } = await supabaseDb
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', allCandidateIds.length > 0 ? allCandidateIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: allCandidateThemes } = await supabaseDb
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', allCandidateIds.length > 0 ? allCandidateIds : ['00000000-0000-0000-0000-000000000000'])

    const bookGenreMap = new Map<string, string[]>()
    const bookThemeMap = new Map<string, string[]>()

    if (allCandidateGenres) {
      for (const row of allCandidateGenres as Array<{ book_id: string; genres?: { name?: string | null } | null }>) {
        const genreName = row.genres?.name
        if (!genreName) continue
        const current = bookGenreMap.get(row.book_id) || []
        current.push(genreName)
        bookGenreMap.set(row.book_id, current)
      }
    }

    if (allCandidateThemes) {
      for (const row of allCandidateThemes as Array<{ book_id: string; themes?: { name?: string | null } | null }>) {
        const themeName = row.themes?.name
        if (!themeName) continue
        const current = bookThemeMap.get(row.book_id) || []
        current.push(themeName)
        bookThemeMap.set(row.book_id, current)
      }
    }

    // First pass: compute raw per-component scores for normalization
    type RawScore = {
      book_id: string
      exploitScore: number
      explorationBonus: number
      popularityScore: number
      friendSignal: number
      genreNames: string[]
      reasoning: string
    }

    const rawScores: RawScore[] = []

    for (const book of allBooks || []) {
      const genreNames = bookGenreMap.get(book.id) || []
      const themeNames = bookThemeMap.get(book.id) || []

      let genreScore = 0
      for (const genreName of genreNames) {
        genreScore += genrePreferences.get(genreName) || 0
      }

      let themeScore = 0
      for (const themeName of themeNames) {
        themeScore += themePreferences.get(themeName) || 0
      }

      const exploitScore = (genreScore * 0.7) + (themeScore * 0.3)

      // FIX 3/5: Use genreExposureCount (actual book count) to determine genre novelty
      let explorationBonus = 0
      for (const genreName of genreNames) {
        const exposure = genreExposureCount.get(genreName) || 0
        if (exposure < 2) {
          explorationBonus += 0.3
        }
      }

      const firstAuthor = book.authors && book.authors.length > 0 ? book.authors[0] : null
      if (firstAuthor && !authorPreferences.has(firstAuthor)) {
        explorationBonus += 0.2
      }
      explorationBonus = Math.min(explorationBonus, 1.0)

      const popularityScore = Math.log((book.total_comparisons || 0) + 1) * 0.1

      const friendLikedCount = friendLikedMap.get(book.id) || 0
      const friendSignal = friendLikedCount / totalFriends // [0, 1], fraction of friends who liked this

      let reasoning = 'Recommended for you'
      if (friendLikedCount >= 2) {
        reasoning = `${friendLikedCount} friends loved this`
      } else if (friendLikedCount === 1) {
        reasoning = 'A friend loved this'
      } else if (explorationBonus >= 0.6) {
        reasoning = 'A fresh pick outside your usual reads'
      } else if (genreScore > 0 && genreNames.length > 0) {
        reasoning = `Popular in ${genreNames[0]}`
      } else if (exploitScore > 0) {
        reasoning = 'Based on your preferences'
      }

      rawScores.push({ book_id: book.id, exploitScore, explorationBonus, popularityScore, friendSignal, genreNames, reasoning })
    }

    // Normalize each component so the weights actually reflect their intended influence
    const maxAbsExploit = rawScores.reduce((max, s) => Math.max(max, Math.abs(s.exploitScore)), 1)
    const maxPopularity = rawScores.reduce((max, s) => Math.max(max, s.popularityScore), 1)
    // explorationBonus and friendSignal are already [0, 1], no normalization needed

    const bookScores: BookScore[] = rawScores
      .map(raw => {
        const normExploit = raw.exploitScore / maxAbsExploit      // [-1, 1]
        const normExploration = raw.explorationBonus               // [0, 1]
        const normPopularity = raw.popularityScore / maxPopularity // [0, 1]
        const normFriends = raw.friendSignal                       // [0, 1]
        const totalScore =
          (normExploit * 0.60) +
          (normExploration * 0.15) +
          (normPopularity * 0.10) +
          (normFriends * 0.15)
        return { book_id: raw.book_id, score: totalScore, reasoning: raw.reasoning }
      })
      .filter(s => s.score > 0)

    // Sort by score descending and get top 20
    bookScores.sort((a, b) => b.score - a.score)

    const topScores = ensureSmartDiversity(bookScores, allBooks || [], bookGenreMap, 20)

    // Fetch full book data for top recommendations
    const topBookIds = topScores.map(bs => bs.book_id)
    await ensureBooksExist(topBookIds, supabaseDb)
    const { data: recommendedBooks, error: booksError } = await supabaseDb
      .from('books')
      .select('id, title, authors, cover_url')
      .in('id', topBookIds.length > 0 ? topBookIds : ['00000000-0000-0000-0000-000000000000'])

    if (booksError) {
      throw new Error(`Failed to fetch recommended books: ${booksError.message}`)
    }

    // Combine books with scores and reasoning
    const recommendations = topScores.map(score => {
      const book = recommendedBooks?.find(b => b.id === score.book_id)
      return {
        book_id: score.book_id,
        book: book || null,
        reasoning: score.reasoning,
        score: score.score,
      }
    }).filter(rec => rec.book !== null)

    const storedRecommendations = await persistRecommendations(
      recommendations.map((rec) => ({
        book_id: rec.book_id,
        score: rec.score,
        reasoning: rec.reasoning,
      }))
    )

    return new Response(
      JSON.stringify({ recommendations: storedRecommendations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
