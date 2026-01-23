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

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Reset rankings_since_last_refresh counter first
    const { error: updateError } = await supabase
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
    const { data: comparisons, error: comparisonsError } = await supabase
      .from('comparisons')
      .select('winner_book_id, loser_book_id')
      .eq('user_id', user.id)

    if (comparisonsError) {
      throw new Error(`Failed to fetch comparisons: ${comparisonsError.message}`)
    }

    const userComparisons = comparisons || []

    // If user has <5 comparisons, return popular books
    if (userComparisons.length < 5) {
      const excludedIds = [
        ...new Set([
          ...userComparisons.map(c => c.winner_book_id),
          ...userComparisons.map(c => c.loser_book_id)
        ]),
      ].filter(Boolean)

      let popularQuery = supabase
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

      return new Response(
        JSON.stringify({ success: true, recommendations }),
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
    const { data: winnerGenres } = await supabase
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', winnerBookIds.length > 0 ? winnerBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: winnerThemes } = await supabase
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', winnerBookIds.length > 0 ? winnerBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: loserGenres } = await supabase
      .from('book_genres')
      .select('book_id, genres!inner(name)')
      .in('book_id', loserBookIds.length > 0 ? loserBookIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: loserThemes } = await supabase
      .from('book_themes')
      .select('book_id, themes!inner(name)')
      .in('book_id', loserBookIds.length > 0 ? loserBookIds : ['00000000-0000-0000-0000-000000000000'])

    // Build preference vectors
    const genrePreferences = new Map<string, number>()
    const themePreferences = new Map<string, number>()

    if (winnerGenres) {
      for (const bg of winnerGenres) {
        const genreName = (bg.genres as any)?.name
        if (genreName) {
          genrePreferences.set(genreName, (genrePreferences.get(genreName) || 0) + 1)
        }
      }
    }

    if (winnerThemes) {
      for (const bt of winnerThemes) {
        const themeName = (bt.themes as any)?.name
        if (themeName) {
          themePreferences.set(themeName, (themePreferences.get(themeName) || 0) + 1)
        }
      }
    }

    if (loserGenres) {
      for (const bg of loserGenres) {
        const genreName = (bg.genres as any)?.name
        if (genreName) {
          genrePreferences.set(genreName, (genrePreferences.get(genreName) || 0) - 1)
        }
      }
    }

    if (loserThemes) {
      for (const bt of loserThemes) {
        const themeName = (bt.themes as any)?.name
        if (themeName) {
          themePreferences.set(themeName, (themePreferences.get(themeName) || 0) - 1)
        }
      }
    }

    const comparedBookIds = new Set([
      ...userComparisons.map(c => c.winner_book_id),
      ...userComparisons.map(c => c.loser_book_id)
    ])

    let allBooksQuery = supabase
      .from('books')
      .select('id, title, authors, cover_url')
      .limit(1000)

    if (comparedBookIds.size > 0) {
      allBooksQuery = allBooksQuery.not('id', 'in', `(${Array.from(comparedBookIds).join(',')})`)
    }

    const { data: allBooks, error: allBooksError } = await allBooksQuery
    if (allBooksError) {
      throw new Error(`Failed to fetch books: ${allBooksError.message}`)
    }

    // Score each book
    const bookScores: Array<{ book_id: string; score: number; reasoning: string }> = []

    for (const book of allBooks || []) {
      const { data: bookGenres } = await supabase
        .from('book_genres')
        .select('genres!inner(name)')
        .eq('book_id', book.id)

      const { data: bookThemes } = await supabase
        .from('book_themes')
        .select('themes!inner(name)')
        .eq('book_id', book.id)

      let genreScore = 0
      if (bookGenres) {
        for (const bg of bookGenres) {
          const genreName = (bg.genres as any)?.name
          if (genreName) {
            genreScore += genrePreferences.get(genreName) || 0
          }
        }
      }

      let themeScore = 0
      if (bookThemes) {
        for (const bt of bookThemes) {
          const themeName = (bt.themes as any)?.name
          if (themeName) {
            themeScore += themePreferences.get(themeName) || 0
          }
        }
      }

      const totalScore = (genreScore * 0.7) + (themeScore * 0.3)

      if (totalScore <= 0 && (!bookGenres || bookGenres.length === 0)) {
        continue
      }

      let reasoning = 'Recommended for you'
      if (genreScore > 0 && bookGenres && bookGenres.length > 0) {
        const topGenre = (bookGenres[0].genres as any)?.name
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

    bookScores.sort((a, b) => b.score - a.score)
    const topScores = bookScores.slice(0, 20)

    const topBookIds = topScores.map(bs => bs.book_id)
    const { data: recommendedBooks, error: booksError } = await supabase
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

    return new Response(
      JSON.stringify({ 
        success: true,
        recommendations 
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
