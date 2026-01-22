// Supabase Edge Function: Get quiz book pair
// Returns 2 random books from starter set, excluding pairs user already compared
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

    // Get all starter books
    const { data: starterBooks, error: booksError } = await supabase
      .from('books')
      .select('id, title, authors, cover_url')
      .eq('is_starter_book', true)
      .eq('starter_set_id', 1)

    if (booksError) {
      throw new Error(`Failed to fetch starter books: ${booksError.message}`)
    }

    if (!starterBooks || starterBooks.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Not enough starter books available' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get user's existing comparisons (to exclude already compared pairs)
    const { data: existingComparisons, error: comparisonsError } = await supabase
      .from('comparisons')
      .select('winner_book_id, loser_book_id')
      .eq('user_id', user.id)
      .eq('is_onboarding', true)

    if (comparisonsError) {
      throw new Error(`Failed to fetch comparisons: ${comparisonsError.message}`)
    }

    // Build set of book pairs user has already compared
    const comparedPairs = new Set<string>()
    if (existingComparisons) {
      for (const comp of existingComparisons) {
        const pair = [comp.winner_book_id, comp.loser_book_id]
          .sort()
          .join('|')
        comparedPairs.add(pair)
      }
    }

    // Find a random pair that hasn't been compared
    const availableBooks = starterBooks.filter(book => book.id)
    let bookA: typeof starterBooks[0] | null = null
    let bookB: typeof starterBooks[0] | null = null
    let attempts = 0
    const maxAttempts = 100

    while (!bookA || !bookB || attempts < maxAttempts) {
      // Pick two random books
      const randomIndexA = Math.floor(Math.random() * availableBooks.length)
      const randomIndexB = Math.floor(Math.random() * availableBooks.length)

      if (randomIndexA === randomIndexB) continue

      const candidateA = availableBooks[randomIndexA]
      const candidateB = availableBooks[randomIndexB]

      // Check if this pair has been compared
      const pairKey = [candidateA.id, candidateB.id].sort().join('|')
      
      if (!comparedPairs.has(pairKey)) {
        bookA = candidateA
        bookB = candidateB
        break
      }

      attempts++
    }

    if (!bookA || !bookB) {
      return new Response(
        JSON.stringify({ error: 'No available book pairs. Quiz may be complete.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Randomly assign which book is shown first
    const shouldSwap = Math.random() < 0.5
    const result = {
      book1: shouldSwap ? bookB : bookA,
      book2: shouldSwap ? bookA : bookB,
    }

    return new Response(
      JSON.stringify(result),
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
