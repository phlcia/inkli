// Supabase Edge Function: Accept invite by phone number match
// Auth required. Called after a new user saves their phone number to user_private_data.
// Looks up any pending invite_links row whose target_phone matches the user's phone,
// and if found, credits the inviter — no deep link URL required.
// Safe to call multiple times: idempotent via accepted_by IS NULL guard and
// user_profiles.invited_by_user_id check.

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

    // Load the invitee's phone number from user_private_data
    const { data: privateData, error: privateError } = await supabaseDb
      .from('user_private_data')
      .select('phone_number')
      .eq('user_id', inviteeUserId)
      .single()

    if (privateError || !privateData?.phone_number) {
      // No phone stored — nothing to match against; not an error
      return jsonResponse({ success: true, matched: false }, 200)
    }

    const inviteePhone = privateData.phone_number as string

    // Find the most recent pending invite link targeting this phone
    const { data: inviteLink, error: linkError } = await supabaseDb
      .from('invite_links')
      .select('id, inviter_user_id, expires_at, accepted_by')
      .eq('target_phone', inviteePhone)
      .is('accepted_by', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (linkError) {
      throw linkError
    }

    if (!inviteLink) {
      // No pending invite link for this phone — nothing to do
      return jsonResponse({ success: true, matched: false }, 200)
    }

    const inviterUserId = inviteLink.inviter_user_id as string

    if (inviterUserId === inviteeUserId) {
      return jsonResponse({ error: 'You cannot use your own invite code' }, 400)
    }

    // Check the invitee hasn't already been linked to an inviter
    const { data: inviteeProfile, error: profileError } = await supabaseDb
      .from('user_profiles')
      .select('invited_by_user_id')
      .eq('user_id', inviteeUserId)
      .single()

    if (profileError || !inviteeProfile) {
      return jsonResponse({ error: 'Profile not found' }, 500)
    }

    if (inviteeProfile.invited_by_user_id != null) {
      // Already linked — idempotent success
      return jsonResponse({ success: true, matched: false }, 200)
    }

    const now = new Date().toISOString()

    // Optimistic CAS: mark link accepted only if still unclaimed
    const { data: updatedLink, error: updateLinkError } = await supabaseDb
      .from('invite_links')
      .update({ accepted_by: inviteeUserId, accepted_at: now })
      .eq('id', inviteLink.id)
      .is('accepted_by', null)
      .select('id')
      .maybeSingle()

    if (updateLinkError || !updatedLink) {
      // Another path (deep link) claimed it first — idempotent success
      return jsonResponse({ success: true, matched: false }, 200)
    }

    // Insert user_invites row — DB trigger credits inviter's successful_invites_count
    const { error: insertInviteError } = await supabaseDb
      .from('user_invites')
      .insert({
        invite_code: inviteLink.id, // use link id as the code reference for phone-matched invites
        inviter_user_id: inviterUserId,
        invitee_user_id: inviteeUserId,
        accepted_at: now,
      })

    if (insertInviteError) {
      if (insertInviteError.code === '23505') {
        // Unique constraint: already linked via another path — idempotent success
        return jsonResponse({ success: true, matched: false }, 200)
      }
      console.error('accept-invite-by-phone insert user_invites error:', insertInviteError)
      return jsonResponse({ error: 'Failed to accept invite' }, 500)
    }

    // Link invitee's profile to inviter
    const { error: updateProfileError } = await supabaseDb
      .from('user_profiles')
      .update({ invited_by_user_id: inviterUserId })
      .eq('user_id', inviteeUserId)

    if (updateProfileError) {
      console.error('accept-invite-by-phone update user_profiles error:', updateProfileError)
      return jsonResponse({ error: 'Failed to link invite' }, 500)
    }

    // Notify inviter (best-effort, non-blocking)
    supabaseDb
      .from('notifications')
      .insert({
        recipient_id: inviterUserId,
        actor_id: inviteeUserId,
        type: 'invite_accepted',
      })
      .then(({ error: notifError }) => {
        if (notifError) {
          console.warn('accept-invite-by-phone: failed to insert notification', notifError)
        }
      })

    return jsonResponse({ success: true, matched: true }, 200)
  } catch (error) {
    console.error('accept-invite-by-phone error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
