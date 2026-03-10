// Supabase Edge Function: Refresh recommendations
// Resets rankings_since_last_refresh counter and regenerates recommendations using v2 algorithm
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
    case 'liked': return 1.2;
    case 'fine': return 0.5;
    case 'disliked': return -0.8;
    default: return 0;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const supabaseDb: SupabaseClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabaseAuth

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const algorithmVersion = 'v2'

    // Reset counter first
    const { error: updateError } = await supabaseDb
      .from('user_profiles')
      .update({
        rankings_since_last_refresh: 0,
        last_refresh_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (updateError) {
      throw new Error(`Failed to update user profile: ${updateError.message}`)
    }

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
        .select(`
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
        `)
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

    // --- v2 algorithm (same as recommendations-generate) ---

    const { data: comparisons, error: comparisonsError } = await supabaseDb
      .from('comparisons')
      .select('winner_book_id, loser_book_id')
      .eq('user_id', user.id)

    if (comparisonsError) {
      throw new Error(`Failed to fetch comparisons: ${comparisonsError.message}`)
    }

    const userComparisons = comparisons || []

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
        for (const row of shelfGenres as Array<{ book_id: string; genres?: { name?: string | null } | null }>) {
          const genreName = row.genres?.name
          if (!genreName) continue
          const current = shelfGenreMap.get(row.book_id) || []
          current.push(genreName)
          shelfGenreMap.set(row.book_id, current)
        }
      }

      if (shelfThemes) {
        for (const row of shelfThemes as Array<{ book_id: string; themes?: { name?: string | null } | null }>) {
          const themeName = row.themes?.name
          if (!themeName) continue
          const current = shelfThemeMap.get(row.book_id) || []
          current.push(themeName)
          shelfThemeMap.set(row.book_id, current)
        }
      }
    }

    // Friends' liked books for social signal
    const { data: followsData } = await supabaseDb
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const friendIds = (followsData || []).map((r: { following_id: string }) => r.following_id)
    const friendLikedMap = new Map<string, number>()

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

    // New users: return popular books
    if (userComparisons.length < 5 && shelfRows.length < 3) {
      const bookStats = new Map<string, { wins: number; total: number }>()
      for (const comp of userComparisons) {
        const w = bookStats.get(comp.winner_book_id) || { wins: 0, total: 0 }
        w.wins++; w.total++
        bookStats.set(comp.winner_book_id, w)
        const l = bookStats.get(comp.loser_book_id) || { wins: 0, total: 0 }
        l.total++
        bookStats.set(comp.loser_book_id, l)
      }

      const frequentlySeenBooks = Array.from(bookStats.entries())
        .filter(([_, stats]) => stats.total >= 5)
        .map(([id]) => id)

      let popularQuery = supabaseDb
        .from('books')
        .select('id, title, authors, cover_url, global_win_rate, total_comparisons, is_starter_book')
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

      const storedRecommendations = await persistRecommendations(
        (popularBooks || []).map((book) => ({
          book_id: book.id,
          score: (book.global_win_rate || 0) * (book.total_comparisons || 0),
          reasoning: 'Popular book',
        }))
      )

      return new Response(
        JSON.stringify({ success: true, recommendations: storedRecommendations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build win rate stats from comparison history
    const bookStats = new Map<string, { wins: number; total: number }>()

    for (const comp of userComparisons) {
      const w = bookStats.get(comp.winner_book_id) || { wins: 0, total: 0 }
      w.wins++; w.total++
      bookStats.set(comp.winner_book_id, w)
      const l = bookStats.get(comp.loser_book_id) || { wins: 0, total: 0 }
      l.total++
      bookStats.set(comp.loser_book_id, l)
    }

    // Batch fetch genres/themes for all comparison books
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

    // Build preference vectors using win rate signal with confidence dampening
    const genrePreferences = new Map<string, number>()
    const themePreferences = new Map<string, number>()
    const genreExposureCount = new Map<string, number>()
    const authorPreferences = new Set<string>()

    for (const [bookId, stats] of bookStats.entries()) {
      const winRate = stats.total > 0 ? stats.wins / stats.total : 0
      const confidence = Math.min(stats.total / 5, 1)
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

    // Add shelf signals
    for (const row of shelfRows) {
      const ratingWeight = getRatingWeight(row.rating)
      if (ratingWeight === 0) continue
      const recencyWeight = getRecencyWeight(row.created_at)
      const totalWeight = ratingWeight * recencyWeight

      for (const genreName of shelfGenreMap.get(row.book_id) || []) {
        genrePreferences.set(genreName, (genrePreferences.get(genreName) || 0) + totalWeight)
        if (row.rating === 'liked') {
          genreExposureCount.set(genreName, (genreExposureCount.get(genreName) || 0) + 1)
        }
      }

      for (const themeName of shelfThemeMap.get(row.book_id) || []) {
        themePreferences.set(themeName, (themePreferences.get(themeName) || 0) + totalWeight)
      }

      if (row.book?.authors) {
        for (const author of row.book.authors) {
          authorPreferences.add(author)
        }
      }
    }

    // Exclude disliked books and shelf books from candidates
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

    // Batch fetch genres/themes for all candidate books
    const allCandidateIds = (allBooks || []).map((b) => b.id)

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

    // First pass: compute raw scores for normalization
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

      let explorationBonus = 0
      for (const genreName of genreNames) {
        const exposure = genreExposureCount.get(genreName) || 0
        if (exposure < 2) explorationBonus += 0.3
      }

      const firstAuthor = book.authors && book.authors.length > 0 ? book.authors[0] : null
      if (firstAuthor && !authorPreferences.has(firstAuthor)) {
        explorationBonus += 0.2
      }
      explorationBonus = Math.min(explorationBonus, 1.0)

      const popularityScore = Math.log((book.total_comparisons || 0) + 1) * 0.1

      const friendLikedCount = friendLikedMap.get(book.id) || 0
      const friendSignal = friendLikedCount / totalFriends

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

    // Normalize and compute final scores
    const maxAbsExploit = rawScores.reduce((max, s) => Math.max(max, Math.abs(s.exploitScore)), 1)
    const maxPopularity = rawScores.reduce((max, s) => Math.max(max, s.popularityScore), 1)

    const bookScores: BookScore[] = rawScores
      .map((raw) => {
        const normExploit = raw.exploitScore / maxAbsExploit
        const normExploration = raw.explorationBonus
        const normPopularity = raw.popularityScore / maxPopularity
        const normFriends = raw.friendSignal
        const totalScore =
          (normExploit * 0.60) +
          (normExploration * 0.15) +
          (normPopularity * 0.10) +
          (normFriends * 0.15)
        return { book_id: raw.book_id, score: totalScore, reasoning: raw.reasoning }
      })
      .filter((s) => s.score > 0)

    bookScores.sort((a, b) => b.score - a.score)
    const topScores = ensureSmartDiversity(bookScores, allBooks || [], bookGenreMap, 20)

    const storedRecommendations = await persistRecommendations(
      topScores.map((s) => ({ book_id: s.book_id, score: s.score, reasoning: s.reasoning }))
    )

    return new Response(
      JSON.stringify({ success: true, recommendations: storedRecommendations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
