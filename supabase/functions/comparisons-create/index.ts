// Supabase Edge Function: Create book comparison
// Records a head-to-head comparison (winner vs loser)
// Auth required: valid JWT in Authorization header
// Database triggers automatically update book and user stats

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

  let isServiceRoleConfigured = false
  let isServiceRoleDistinct = false

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
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
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    isServiceRoleConfigured = Boolean(serviceRoleKey)
    isServiceRoleDistinct = Boolean(serviceRoleKey && serviceRoleKey !== supabaseAnonKey)
    console.log('comparisons-create auth config', {
      hasServiceRoleKey: isServiceRoleConfigured,
      serviceRoleDistinctFromAnon: isServiceRoleDistinct,
    })

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    // Get authenticated user
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

    const supabaseDb = isServiceRoleConfigured
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabaseAuth

    // Parse request body
    const body = await req.json()
    const { winner_book_id, loser_book_id, is_onboarding } = body

    // Validate input
    if (!winner_book_id || !loser_book_id) {
      return new Response(
        JSON.stringify({ error: 'Missing winner_book_id or loser_book_id' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (winner_book_id === loser_book_id) {
      return new Response(
        JSON.stringify({ error: 'Winner and loser must be different books' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if books exist
    const { data: books, error: booksError } = await supabaseDb
      .from('books')
      .select('id')
      .in('id', [winner_book_id, loser_book_id])

    if (booksError) {
      throw new Error(`Failed to verify books: ${booksError.message}`)
    }

    if (!books || books.length !== 2) {
      return new Response(
        JSON.stringify({ error: 'One or both books not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check for duplicate comparison (using unique index)
    // The unique index handles both orderings, but we check explicitly for better error message
    const { data: existingComparison, error: checkError } = await supabaseDb
      .from('comparisons')
      .select('id')
      .eq('user_id', user.id)
      .or(`and(winner_book_id.eq.${winner_book_id},loser_book_id.eq.${loser_book_id}),and(winner_book_id.eq.${loser_book_id},loser_book_id.eq.${winner_book_id})`)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Failed to check for duplicates: ${checkError.message}`)
    }

    if (existingComparison) {
      return new Response(
        JSON.stringify({ error: 'Comparison already exists for this book pair' }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Insert comparison
    const { data: comparison, error: insertError } = await supabaseDb
      .from('comparisons')
      .insert({
        user_id: user.id,
        winner_book_id,
        loser_book_id,
        is_onboarding: is_onboarding === true
      })
      .select()
      .single()

    if (insertError) {
      // Check if it's a unique constraint violation
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Comparison already exists for this book pair' }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      console.error('Insert comparison failed:', insertError)
      throw new Error(`Failed to create comparison: ${insertError.message}`)
    }

    // Database triggers automatically update book and user stats
    return new Response(
      JSON.stringify({ 
        success: true, 
        comparison,
        message: 'Comparison created successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        debug: {
          serviceRoleConfigured: isServiceRoleConfigured,
          serviceRoleDistinctFromAnon: isServiceRoleDistinct,
        },
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
