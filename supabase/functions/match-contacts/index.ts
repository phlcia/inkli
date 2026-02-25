// Supabase Edge Function: Match contacts to existing users
// Usage: invoke via supabase.functions.invoke('match-contacts', { body: { phones, userId } })
// Notes:
// - Normalizes phones to E.164.
// - Never logs raw phone numbers.
// - Respects a hard cap on phone count to avoid abuse.
// - Filters out the current user and blocked users before returning matches.

// @ts-expect-error - Deno types are available at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-expect-error - esm.sh module
import { parsePhoneNumber } from 'https://esm.sh/libphonenumber-js@1'

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: {
    get: (key: string) => string | undefined
  }
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizePhoneE164(raw: string): string | null {
  try {
    const phoneNumber = parsePhoneNumber(raw, 'US')
    return phoneNumber?.isValid() ? phoneNumber.format('E.164') : null
  } catch {
    return null
  }
}

type MatchContactsRequest = {
  phones?: unknown
  userId?: unknown
}

type PublicProfile = {
  user_id: string
  username: string
  name: string | null
  profile_photo_url: string | null
  account_type: string
}

type MatchContactsResponse = {
  matches: PublicProfile[]
}

// @ts-expect-error - Deno.serve is available in Supabase Edge Functions runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const MAX_PHONES = 500

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or service role key')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const body = (await req.json().catch(() => ({}))) as MatchContactsRequest
    const rawPhones = Array.isArray(body?.phones) ? body.phones : []

    if (!Array.isArray(rawPhones)) {
      return new Response(
        JSON.stringify({ error: 'phones must be an array of strings' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (rawPhones.length === 0) {
      const empty: MatchContactsResponse = { matches: [] }
      return new Response(JSON.stringify(empty), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (rawPhones.length > MAX_PHONES) {
      return new Response(
        JSON.stringify({ error: 'too_many_phones', max: MAX_PHONES }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Derive viewerId from the Authorization header rather than trusting the body.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const viewerId = user.id

    // Normalize and dedupe phone numbers.
    const normalizedSet = new Set<string>()
    for (const raw of rawPhones) {
      if (typeof raw !== 'string') continue
      const trimmed = raw.trim()
      if (!trimmed) continue
      const normalized = normalizePhoneE164(trimmed)
      if (normalized) {
        normalizedSet.add(normalized)
      }
    }

    const normalizedPhones = Array.from(normalizedSet)

    if (normalizedPhones.length === 0) {
      const empty: MatchContactsResponse = { matches: [] }
      return new Response(JSON.stringify(empty), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Aggregate-only logging (no raw phone values).
    console.log(
      JSON.stringify({
        event: 'match_contacts_request',
        phones_submitted: rawPhones.length,
        phones_normalized: normalizedPhones.length,
      })
    )

    // Fetch candidate matches by phone number from user_private_data.
    const { data: privateRows, error: privateError } = await supabaseAdmin
      .from('user_private_data')
      .select(
        `
        user_id,
        user_profiles:user_profiles!inner(
          user_id,
          username,
          name,
          profile_photo_url,
          account_type
        )
      `
      )
      .in('phone_number', normalizedPhones)

    if (privateError) {
      throw privateError
    }

    if (!privateRows || privateRows.length === 0) {
      const empty: MatchContactsResponse = { matches: [] }
      return new Response(JSON.stringify(empty), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Collect candidate user ids.
    const candidateProfiles: PublicProfile[] = []
    const candidateIds = new Set<string>()

    for (const row of privateRows as any[]) {
      const profile = row.user_profiles as PublicProfile | null
      if (!profile) continue
      if (!profile.user_id) continue
      candidateProfiles.push(profile)
      candidateIds.add(profile.user_id)
    }

    if (candidateProfiles.length === 0) {
      const empty: MatchContactsResponse = { matches: [] }
      return new Response(JSON.stringify(empty), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch blocked relationships involving the viewer to filter out blocked users.
    const { data: blockedRows, error: blockedError } = await supabaseAdmin
      .from('blocked_users')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`)

    if (blockedError) {
      throw blockedError
    }

    const blockedIds = new Set<string>()
    for (const row of blockedRows ?? []) {
      const blockerId = row.blocker_id as string
      const blockedId = row.blocked_id as string
      if (blockerId === viewerId) {
        blockedIds.add(blockedId)
      } else if (blockedId === viewerId) {
        blockedIds.add(blockerId)
      }
    }

    const filtered = candidateProfiles.filter((profile) => {
      if (!profile.user_id) return false
      if (profile.user_id === viewerId) return false
      if (blockedIds.has(profile.user_id)) return false
      return true
    })

    const response: MatchContactsResponse = {
      matches: filtered,
    }

    console.log(
      JSON.stringify({
        event: 'match_contacts_result',
        phones_normalized: normalizedPhones.length,
        matches_found: filtered.length,
      })
    )

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('match-contacts error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

