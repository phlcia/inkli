// Supabase Edge Function: Accept invite (invite-to-unlock)
// Called when a new user completes onboarding (quiz completed or skipped) and has a pending invite code.
// Validates code, links invitee to inviter, inserts user_invites row with accepted_at; trigger credits inviter.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const inviteeUserId = user.id

    const body = (await req.json().catch(() => ({}))) as { invite_code?: string }
    const inviteCode = typeof body?.invite_code === 'string' ? body.invite_code.trim() : ''
    if (!inviteCode) {
      return jsonResponse({ error: 'Invalid or missing invite_code' }, 400)
    }

    // Look up invite link by code (single-use, 24h expiry)
    const { data: inviteLink, error: inviteLinkError } = await supabaseDb
      .from('invite_links')
      .select('id, inviter_user_id, expires_at, accepted_by')
      .eq('code', inviteCode)
      .maybeSingle()

    if (inviteLinkError || !inviteLink) {
      return jsonResponse({ error: 'Invalid or expired invite code' }, 400)
    }

    const inviterUserId = inviteLink.inviter_user_id as string
    if (inviterUserId === inviteeUserId) {
      return jsonResponse({ error: 'You cannot use your own invite code' }, 400)
    }

    const expiresAt = inviteLink.expires_at ? new Date(inviteLink.expires_at as string).getTime() : null
    const nowMs = Date.now()
    if (!expiresAt || expiresAt < nowMs) {
      return jsonResponse({ error: 'Invalid or expired invite code' }, 400)
    }

    if (inviteLink.accepted_by) {
      return jsonResponse({ error: 'Invalid or expired invite code' }, 400)
    }

    // Load invitee profile to check already linked and onboarding status
    const { data: inviteeProfile, error: inviteeProfileError } = await supabaseDb
      .from('user_profiles')
      .select('invited_by_user_id, completed_onboarding_quiz, skipped_onboarding_quiz')
      .eq('user_id', inviteeUserId)
      .single()

    if (inviteeProfileError || !inviteeProfile) {
      return jsonResponse({ error: 'Profile not found' }, 500)
    }

    if (inviteeProfile.invited_by_user_id != null) {
      return jsonResponse({ error: 'You have already been linked to an inviter' }, 400)
    }

    const completed = Boolean(inviteeProfile.completed_onboarding_quiz)
    const skipped = Boolean(inviteeProfile.skipped_onboarding_quiz)
    if (!completed && !skipped) {
      return jsonResponse({ error: 'Complete or skip onboarding before accepting an invite' }, 400)
    }

    const now = new Date().toISOString()

    // Mark invite link as accepted (single-use)
    const { data: updatedLink, error: updateLinkError } = await supabaseDb
      .from('invite_links')
      .update({
        accepted_by: inviteeUserId,
        accepted_at: now,
      })
      .eq('id', inviteLink.id)
      .is('accepted_by', null)
      .select('id')
      .maybeSingle()

    if (updateLinkError || !updatedLink) {
      console.error('accept-invite update invite_links error:', updateLinkError)
      return jsonResponse({ error: 'Invalid or expired invite code' }, 400)
    }

    // Insert user_invites row with accepted_at set (trigger will credit inviter)
    const { error: insertInviteError } = await supabaseDb
      .from('user_invites')
      .insert({
        invite_code: inviteCode,
        inviter_user_id: inviterUserId,
        invitee_user_id: inviteeUserId,
        accepted_at: now,
      })

    if (insertInviteError) {
      if (insertInviteError.code === '23505') {
        return jsonResponse({ error: 'This invite has already been used for your account' }, 400)
      }
      console.error('accept-invite insert user_invites error:', insertInviteError)
      return jsonResponse({ error: 'Failed to accept invite' }, 500)
    }

    // Set invitee's invited_by_user_id
    const { error: updateProfileError } = await supabaseDb
      .from('user_profiles')
      .update({ invited_by_user_id: inviterUserId })
      .eq('user_id', inviteeUserId)

    if (updateProfileError) {
      console.error('accept-invite update user_profiles error:', updateProfileError)
      return jsonResponse({ error: 'Failed to link invite' }, 500)
    }

    return jsonResponse({ success: true }, 200)
  } catch (error) {
    console.error('accept-invite error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
