// Supabase Edge Function: Spend invite point to unlock a feature
// Auth required. Validates points available, feature not already unlocked.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_FEATURE_KEYS = [
  'community_scores',
  'activity_feed',
  'friend_recommendations',
  'friends_rankings',
  'leaderboard_circles',
] as const

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseDb = createClient(supabaseUrl, serviceRoleKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const userId = user.id

    const body = (await req.json().catch(() => ({}))) as { feature_key?: string }
    const featureKey = typeof body?.feature_key === 'string' ? body.feature_key.trim() : ''
    if (!featureKey || !VALID_FEATURE_KEYS.includes(featureKey as any)) {
      return jsonResponse({ error: 'Invalid or unsupported feature_key' }, 400)
    }

    const { data: profile, error: profileError } = await supabaseDb
      .from('user_profiles')
      .select('unspent_invite_points, successful_invites_count')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 500)
    }

    if ((profile.unspent_invite_points ?? 0) < 1) {
      return jsonResponse({ error: 'No unlock points available' }, 400)
    }

    const { count: unlockedCount, error: countError } = await supabaseDb
      .from('user_unlocked_features')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (countError) {
      return jsonResponse({ error: 'Failed to check unlocked features' }, 500)
    }

    if ((profile.successful_invites_count ?? 0) <= (unlockedCount ?? 0)) {
      return jsonResponse({ error: 'No unlock points available' }, 400)
    }

    const { data: existing, error: existingError } = await supabaseDb
      .from('user_unlocked_features')
      .select('id')
      .eq('user_id', userId)
      .eq('feature_key', featureKey)
      .maybeSingle()

    if (existingError) {
      return jsonResponse({ error: 'Failed to check feature' }, 500)
    }
    if (existing) {
      return jsonResponse({ error: 'Feature already unlocked' }, 400)
    }

    // Decrement first — if this fails nothing is inserted, no inconsistency
    const { error: updateError } = await supabaseDb
      .from('user_profiles')
      .update({ unspent_invite_points: (profile.unspent_invite_points ?? 0) - 1 })
      .eq('user_id', userId)

    if (updateError) {
      console.error('spend-invite-point decrement error:', updateError)
      return jsonResponse({ error: 'Failed to spend point' }, 500)
    }

    const now = new Date().toISOString()

    const { error: insertError } = await supabaseDb
      .from('user_unlocked_features')
      .insert({ user_id: userId, feature_key: featureKey, unlocked_at: now })

    if (insertError) {
      // Roll back the decrement so the user doesn't lose their point
      await supabaseDb
        .from('user_profiles')
        .update({ unspent_invite_points: profile.unspent_invite_points ?? 0 })
        .eq('user_id', userId)
      if (insertError.code === '23505') {
        return jsonResponse({ error: 'Feature already unlocked' }, 400)
      }
      console.error('spend-invite-point insert error:', insertError)
      return jsonResponse({ error: 'Failed to unlock feature' }, 500)
    }

    return jsonResponse({ success: true }, 200)
  } catch (error) {
    console.error('spend-invite-point error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
