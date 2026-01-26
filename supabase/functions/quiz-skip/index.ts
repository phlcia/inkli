// Supabase Edge Function: Skip onboarding quiz
// Marks user as skipped_onboarding_quiz = true
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

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseDb = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabaseAuth

    // Get authenticated user
    const token = authHeader.replace('Bearer ', '')
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

    // Update user profile to mark quiz as skipped
    const { error: updateError } = await supabaseDb
      .from('user_profiles')
      .update({ 
        skipped_onboarding_quiz: true,
        completed_onboarding_quiz: false
      })
      .eq('user_id', user.id)

    if (updateError) {
      throw new Error(`Failed to update user profile: ${updateError.message}`)
    }

    // Seed recommendations with starter books for skipped quiz users.
    const { data: starterBooks, error: starterError } = await supabaseDb
      .from('books')
      .select('id')
      .eq('is_starter_book', true)
      .eq('starter_set_id', 1)
      .order('title', { ascending: true })
      .limit(30)

    if (starterError) {
      throw new Error(`Failed to fetch starter books: ${starterError.message}`)
    }

    const createdAt = new Date().toISOString()

    const { error: deleteError } = await supabaseDb
      .from('recommendations')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      throw new Error(`Failed to clear recommendations: ${deleteError.message}`)
    }

    if (starterBooks && starterBooks.length > 0) {
      const { error: insertError } = await supabaseDb
        .from('recommendations')
        .insert(
          starterBooks.map((book, index) => ({
            user_id: user.id,
            book_id: book.id,
            score: starterBooks.length - index,
            reason: 'Starter book',
            algorithm_version: 'starter-v1',
            created_at: createdAt,
          }))
        )

      if (insertError) {
        throw new Error(`Failed to insert recommendations: ${insertError.message}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Quiz skipped' }),
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
