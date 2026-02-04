// Supabase Edge Function: Refresh recommendations
// Calls recommendations-generate and resets rankings_since_last_refresh counter
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

type GenreJoinRow = { genres?: { name?: string | null } | null };
type ThemeJoinRow = { themes?: { name?: string | null } | null };
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
    const serviceRoleKey = Deno.env.get('EXPO_SERVICE_ROLE_KEY') ?? ''

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

    // Reset rankings_since_last_refresh counter first
    const { error: updateError } = await supabaseDb
      .from('user_profiles')
      .update({ 
        rankings_since_last_refresh: 0,
        last_refresh_at: new Date().toISOString()
      })
      .eq('user_id', user.id)

    if (updateError) {
      throw new Error(`Failed to update user profile: ${updateError.message}`)
    }

    // Import and use the same logic as recommendations-generate
    // For MVP simplicity, we'll duplicate the logic here
    // (In production, you could extract to a shared module)
    
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

    // If user has <5 comparisons and minimal shelf data, return popular books
    if (userComparisons.length < 5 && shelfRows.length < 3) {
      const excludedIds = [
        ...new Set([
          ...userComparisons.map(c => c.winner_book_id),
          ...userComparisons.map(c => c.loser_book_id)
        ]),
      ].filter(Boolean)

      let popularQuery = supabaseDb
        .from('books')
        .select(`
          id,
          title,
          authors,
          cover_url,
          global_win_rate,
          total_comparisons
        `)
        .order('global_win_rate', { ascending: false, nullsLast: true })
        .order('total_comparisons', { ascending: false })
        .limit(20)

      if (excludedIds.length > 0) {
        popularQuery = popularQuery.not('id', 'in', `(${excludedIds.join(',')})`)
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
        JSON.stringify({ success: true, recommendations: storedRecommendations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate win rate per book (same logic as generate)
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

    const winnerBookIds: string[] = []
    const loserBookIds: string[] = []

    for (const [bookId, stats] of bookStats.entries()) {
      const winRate = stats.total > 0 ? stats.wins / stats.total : 0
      if (winRate >= 0.6) {
        winnerBookIds.push(bookId)
      } else if (winRate < 0.4) {
        loserBookIds.push(bookId)
      }
    }

    // Get genres and themes for winner/loser books
    const { data: winnerGenres } = await supabaseDb
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', winnerBookIds.length > 0 ? winnerBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: winnerThemes } = await supabaseDb
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', winnerBookIds.length > 0 ? winnerBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: loserGenres } = await supabaseDb
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', loserBookIds.length > 0 ? loserBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: loserThemes } = await supabaseDb
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', loserBookIds.length > 0 ? loserBookIds : ['00000000-0000-0000-0000-000000000000'])

    // Build preference vectors
    const genrePreferences = new Map<string, number>()
    const themePreferences = new Map<string, number>()
    const authorPreferences = new Set<string>()

    if (winnerGenres) {
      const winnerGenreRows = winnerGenres as GenreJoinRow[]
      for (const bg of winnerGenreRows) {
        const genreName = bg.genres?.name
        if (genreName) {
          genrePreferences.set(genreName, (genrePreferences.get(genreName) || 0) + 1)
        }
      }
    }

    if (winnerThemes) {
      const winnerThemeRows = winnerThemes as ThemeJoinRow[]
      for (const bt of winnerThemeRows) {
        const themeName = bt.themes?.name
        if (themeName) {
          themePreferences.set(themeName, (themePreferences.get(themeName) || 0) + 1)
        }
      }
    }

    if (loserGenres) {
      const loserGenreRows = loserGenres as GenreJoinRow[]
      for (const bg of loserGenreRows) {
        const genreName = bg.genres?.name
        if (genreName) {
          genrePreferences.set(genreName, (genrePreferences.get(genreName) || 0) - 1)
        }
      }
    }

    if (loserThemes) {
      const loserThemeRows = loserThemes as ThemeJoinRow[]
      for (const bt of loserThemeRows) {
        const themeName = bt.themes?.name
        if (themeName) {
          themePreferences.set(themeName, (themePreferences.get(themeName) || 0) - 1)
        }
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

    const comparedBookIds = new Set([
      ...userComparisons.map(c => c.winner_book_id),
      ...userComparisons.map(c => c.loser_book_id)
    ])

    let allBooksQuery = supabaseDb
      .from('books')
      .select('id, title, authors, cover_url, total_comparisons')
      .limit(1000)

    if (comparedBookIds.size > 0) {
      allBooksQuery = allBooksQuery.not('id', 'in', `(${Array.from(comparedBookIds).join(',')})`)
    }

    const { data: allBooks, error: allBooksError } = await allBooksQuery
    if (allBooksError) {
      throw new Error(`Failed to fetch books: ${allBooksError.message}`)
    }

    // Score each book
    const bookScores: BookScore[] = []
    const bookGenreMap = new Map<string, string[]>()

    for (const book of allBooks || []) {
      const { data: bookGenres } = await supabaseDb
        .from('book_genres')
        .select('genres!inner(name)')
        .eq('book_id', book.id)

      const { data: bookThemes } = await supabaseDb
        .from('book_themes')
        .select('themes!inner(name)')
        .eq('book_id', book.id)

      const genreNames: string[] = []
      if (bookGenres) {
        const bookGenreRows = bookGenres as GenreJoinRow[]
        for (const bg of bookGenreRows) {
          const genreName = bg.genres?.name
          if (genreName) {
            genreNames.push(genreName)
          }
        }
      }
      bookGenreMap.set(book.id, genreNames)

      let genreScore = 0
      for (const genreName of genreNames) {
        genreScore += genrePreferences.get(genreName) || 0
      }

      const themeNames: string[] = []
      if (bookThemes) {
        const bookThemeRows = bookThemes as ThemeJoinRow[]
        for (const bt of bookThemeRows) {
          const themeName = bt.themes?.name
          if (themeName) {
            themeNames.push(themeName)
          }
        }
      }

      let themeScore = 0
      for (const themeName of themeNames) {
        themeScore += themePreferences.get(themeName) || 0
      }

      const exploitScore = (genreScore * 0.7) + (themeScore * 0.3)

      let explorationBonus = 0
      for (const genreName of genreNames) {
        const userExperience = genrePreferences.get(genreName) || 0
        if (userExperience < 2) {
          explorationBonus += 0.3
        }
      }

      const firstAuthor =
        book.authors && book.authors.length > 0 ? book.authors[0] : null
      if (firstAuthor && !authorPreferences.has(firstAuthor)) {
        explorationBonus += 0.2
      }
      explorationBonus = Math.min(explorationBonus, 1.0)

      const popularityScore = Math.log((book.total_comparisons || 0) + 1) * 0.1

      const totalScore =
        (exploitScore * 0.7) +
        (explorationBonus * 0.2) +
        (popularityScore * 0.1)

      if (totalScore <= 0 && genreNames.length === 0 && themeNames.length === 0) {
        continue
      }

      let reasoning = 'Recommended for you'
      if (explorationBonus >= 0.6) {
        reasoning = 'A fresh pick outside your usual reads'
      } else if (genreScore > 0 && genreNames.length > 0) {
        reasoning = `Popular in ${genreNames[0]}`
      } else if (totalScore > 0) {
        reasoning = 'Based on your preferences'
      }

      bookScores.push({
        book_id: book.id,
        score: totalScore,
        reasoning,
      })
    }

    bookScores.sort((a, b) => b.score - a.score)
    const topScores = ensureSmartDiversity(bookScores, allBooks || [], bookGenreMap, 20)

    const topBookIds = topScores.map(bs => bs.book_id)
    const { data: recommendedBooks, error: booksError } = await supabaseDb
      .from('books')
      .select('id, title, authors, cover_url')
      .in('id', topBookIds.length > 0 ? topBookIds : ['00000000-0000-0000-0000-000000000000'])

    if (booksError) {
      throw new Error(`Failed to fetch recommended books: ${booksError.message}`)
    }

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
      JSON.stringify({ 
        success: true,
        recommendations: storedRecommendations
      }),
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
