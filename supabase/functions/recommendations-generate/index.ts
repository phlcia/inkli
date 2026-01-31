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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

    const algorithmVersion = 'v1'

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

    // If user has <5 comparisons, return popular books
    if (userComparisons.length < 5) {
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

    // Calculate win rate per book
    const bookStats = new Map<string, { wins: number; total: number }>()
    
    for (const comp of userComparisons) {
      // Count wins
      const winnerStats = bookStats.get(comp.winner_book_id) || { wins: 0, total: 0 }
      winnerStats.wins++
      winnerStats.total++
      bookStats.set(comp.winner_book_id, winnerStats)

      // Count losses
      const loserStats = bookStats.get(comp.loser_book_id) || { wins: 0, total: 0 }
      loserStats.total++
      bookStats.set(comp.loser_book_id, loserStats)
    }

    // Identify winners (win_rate >= 0.6) and losers (win_rate < 0.4)
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

    // Get genres and themes for winner books
    const { data: winnerGenres, error: winnerGenresError } = await supabaseDb
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', winnerBookIds.length > 0 ? winnerBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: winnerThemes, error: winnerThemesError } = await supabaseDb
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', winnerBookIds.length > 0 ? winnerBookIds : ['00000000-0000-0000-0000-000000000000'])

    // Get genres and themes for loser books
    const { data: loserGenres, error: loserGenresError } = await supabaseDb
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', loserBookIds.length > 0 ? loserBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: loserThemes, error: loserThemesError } = await supabaseDb
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', loserBookIds.length > 0 ? loserBookIds : ['00000000-0000-0000-0000-000000000000'])

    // Build preference vectors
    const genrePreferences = new Map<string, number>()
    const themePreferences = new Map<string, number>()

    // Count winner genres/themes
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

    // Subtract loser genres/themes
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

    // Only exclude books user REALLY disliked
    const reallyDislikedBookIds = new Set<string>()
    for (const [bookId, stats] of bookStats.entries()) {
      const winRate = stats.total > 0 ? stats.wins / stats.total : 0
      if (winRate < 0.3 && stats.total >= 3) {
        reallyDislikedBookIds.add(bookId)
      }
    }

    // Get all books with genres/themes (excluding really disliked books)
    let allBooksQuery = supabaseDb
      .from('books')
      .select('id, title, authors, cover_url, open_library_id, isbn_10, isbn_13')
      .limit(1000) // Reasonable limit for MVP

    if (reallyDislikedBookIds.size > 0) {
      allBooksQuery = allBooksQuery.not('id', 'in', `(${Array.from(reallyDislikedBookIds).join(',')})`)
    }

    const { data: allBooks, error: allBooksError } = await allBooksQuery
    if (allBooksError) {
      throw new Error(`Failed to fetch books: ${allBooksError.message}`)
    }

    // Score each book
    const bookScores: BookScore[] = []

    for (const book of allBooks || []) {
      // Get book's genres and themes
      const { data: bookGenres } = await supabaseDb
        .from('book_genres')
        .select('genres!inner(name)')
        .eq('book_id', book.id)

      const { data: bookThemes } = await supabaseDb
        .from('book_themes')
        .select('themes!inner(name)')
        .eq('book_id', book.id)

      // Calculate genre score
      let genreScore = 0
      if (bookGenres) {
        const bookGenreRows = bookGenres as GenreJoinRow[]
        for (const bg of bookGenreRows) {
          const genreName = bg.genres?.name
          if (genreName) {
            genreScore += genrePreferences.get(genreName) || 0
          }
        }
      }

      // Calculate theme score
      let themeScore = 0
      if (bookThemes) {
        const bookThemeRows = bookThemes as ThemeJoinRow[]
        for (const bt of bookThemeRows) {
          const themeName = bt.themes?.name
          if (themeName) {
            themeScore += themePreferences.get(themeName) || 0
          }
        }
      }

      // Total score (70% genre, 30% theme)
      const totalScore = (genreScore * 0.7) + (themeScore * 0.3)

      // Skip books with no genres/themes or negative scores
      if (totalScore <= 0 && (!bookGenres || bookGenres.length === 0)) {
        continue
      }

      // Generate reasoning
      let reasoning = 'Recommended for you'
      if (genreScore > 0 && bookGenres && bookGenres.length > 0) {
        const topGenre = (bookGenres[0] as GenreJoinRow).genres?.name
        reasoning = `Popular in ${topGenre}`
      } else if (totalScore > 0) {
        reasoning = 'Based on your preferences'
      }

      bookScores.push({
        book_id: book.id,
        score: totalScore,
        reasoning,
      })
    }

    // Sort by score descending and get top 20
    bookScores.sort((a, b) => b.score - a.score)

    // Apply diversity filter - max 2 books per author
    const diverseScores: BookScore[] = []
    const authorBookCount = new Map<string, number>()

    for (const score of bookScores) {
      const book = (allBooks || []).find(b => b.id === score.book_id)
      if (!book) continue

      // Get first author (normalized to lowercase)
      const firstAuthor = (book.authors && book.authors.length > 0)
        ? book.authors[0].toLowerCase()
        : 'unknown'

      const currentCount = authorBookCount.get(firstAuthor) || 0

      // Only include if we haven't hit the limit for this author
      if (currentCount < 2) {
        diverseScores.push(score)
        authorBookCount.set(firstAuthor, currentCount + 1)
      }

      // Stop once we have 20 diverse recommendations
      if (diverseScores.length >= 20) break
    }

    // Use diverse scores if we got enough, otherwise fall back to top scores
    const topScores = diverseScores.length >= 10
      ? diverseScores.slice(0, 20)
      : bookScores.slice(0, 20)

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
