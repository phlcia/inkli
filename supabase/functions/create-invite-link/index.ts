// Supabase Edge Function: Create per-share invite link
// Auth required. Generates a single-use, 24h invite link row and increments sent_invites_count.
// Accepts optional target_phone (E.164) in the request body; stored on the invite_links row
// so that the invitee can be matched by phone at signup even if the deep link URL is lost.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-expect-error - esm.sh module
import { parsePhoneNumber } from 'https://esm.sh/libphonenumber-js@1'

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generateInviteCode(length = 10): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * alphabet.length)
    code += alphabet[index]
  }
  return code
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
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
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const userId = user.id

    // Parse optional target_phone from request body and normalize to E.164
    const body = await req.json().catch(() => ({})) as { target_phone?: string }
    let targetPhone: string | null = null
    if (typeof body?.target_phone === 'string' && body.target_phone.trim()) {
      try {
        const parsed = parsePhoneNumber(body.target_phone.trim(), 'US')
        targetPhone = parsed?.isValid() ? parsed.format('E.164') : null
      } catch {
        targetPhone = null
      }
    }

    const code = generateInviteCode(10)

    const { data: link, error: insertError } = await supabaseDb
      .from('invite_links')
      .insert({
        inviter_user_id: userId,
        code,
        ...(targetPhone ? { target_phone: targetPhone } : {}),
      })
      .select('code')
      .single()

    if (insertError || !link) {
      console.error('create-invite-link insert error:', insertError)
      return jsonResponse({ error: 'Failed to create invite link' }, 500)
    }

    const { error: incrementError } = await supabaseAuth.rpc('increment_sent_invites_count')
    if (incrementError) {
      console.error('create-invite-link increment_sent_invites_count error:', incrementError)
      // Do not fail the whole request; the link is already created.
    }

    const baseUrl = Deno.env.get('INVITE_BASE_URL') ?? 'https://inkliapp.com/invite'
    const url = `${baseUrl}/${link.code}`

    return jsonResponse({ code: link.code, url }, 200)
  } catch (error) {
    console.error('create-invite-link error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

