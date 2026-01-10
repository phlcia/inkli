// Supabase Edge Function: Update community stats for a book
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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('URL') ?? ''
    const supabaseAnonKey = Deno.env.get('ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

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

    const bookId = (body as { book_id?: string }).book_id
    if (!bookId || typeof bookId !== 'string' || !isValidUuid(bookId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid book_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: statsData, error: statsError } = await adminClient
      .from('user_books')
      .select('rank_score, user_id')
      .eq('book_id', bookId)
      .not('rank_score', 'is', null)

    if (statsError) {
      return new Response(
        JSON.stringify({ error: statsError.message, details: statsError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rankScores = (statsData || []).map((ub) => ub.rank_score as number)
    const uniqueUserIds = new Set((statsData || []).map((ub) => ub.user_id as string))

    const averageScore = rankScores.length > 0
      ? rankScores.reduce((sum, score) => sum + score, 0) / rankScores.length
      : null
    const memberCount = uniqueUserIds.size

    const roundedAverage = averageScore !== null
      ? Math.round(averageScore * 100) / 100
      : null

    const { error: updateError } = await adminClient
      .from('books')
      .update({
        community_average_score: roundedAverage,
        community_rank_count: memberCount,
        stats_last_updated: new Date().toISOString(),
      })
      .eq('id', bookId)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message, details: updateError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        book_id: bookId,
        community_average_score: roundedAverage,
        community_rank_count: memberCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
