// Supabase Edge Function: Update genres for an existing book
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

const MAX_GENRES = 15
const MAX_GENRE_LEN = 50

function cleanStringArray(value: unknown, maxItems: number, maxItemLen: number): string[] {
  if (!Array.isArray(value)) return []
  const cleaned = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxItemLen)
  return cleaned.slice(0, maxItems)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('URL') ?? ''
    const supabaseAnonKey = Deno.env.get('ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('EXPO_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: authError } = await userClient.auth.getUser()
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { book_id, genres } = body as { book_id?: string; genres?: unknown }

    if (!book_id || typeof book_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid book_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanedGenres = cleanStringArray(genres, MAX_GENRES, MAX_GENRE_LEN)

    // Use service role to bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data, error: updateError } = await adminClient
      .from('books')
      .update({ genres: cleanedGenres })
      .eq('id', book_id)
      .select('id, genres')
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      return new Response(
        JSON.stringify({ error: updateError.message, details: updateError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, book_id: data.id, genres: data.genres }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
