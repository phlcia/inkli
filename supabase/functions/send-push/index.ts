// Supabase Edge Function: Send push notification via Expo Push API
// Invoked by Database Webhook on notifications INSERT. Sends to all push_tokens for recipient,
// stores ticket IDs in push_send_tickets for delayed receipt polling (push-receipts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'follow_reject'
  | 'invite_accepted'
  | 'recommendations_ready'
  | 'reading_nudge'

interface WebhookPayload {
  type?: string
  record?: {
    id: string
    recipient_id: string
    actor_id?: string | null
    type: NotificationType
    user_book_id?: string | null
    comment_id?: string | null
    created_at: string
  }
}

interface NotificationRow {
  id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  user_book_id: string | null
  actor?: { username?: string | null } | null
  user_book?: { book?: { title?: string | null } | null } | null
  comment?: { comment_text?: string | null } | null
}

function buildTitleAndBody(
  type: NotificationType,
  actorName: string | null,
  bookTitle: string | null,
  _commentSnippet?: string | null
): { title: string; body: string } {
  const actor = actorName ?? 'Someone'
  switch (type) {
    case 'like':
      return {
        title: 'New like',
        body: bookTitle ? `${actor} liked your ranking of "${bookTitle}"` : `${actor} liked your activity`,
      }
    case 'comment':
      return {
        title: 'New comment',
        body: bookTitle ? `${actor} commented on your ranking of "${bookTitle}"` : `${actor} commented on your activity`,
      }
    case 'follow':
      return { title: 'New follower', body: `${actor} started following you` }
    case 'follow_request':
      return { title: 'Follow request', body: `${actor} requested to follow you` }
    case 'follow_accept':
      return { title: 'Follow request accepted', body: `${actor} accepted your follow request` }
    case 'follow_reject':
      return { title: 'Follow request declined', body: `${actor} declined your follow request` }
    case 'invite_accepted':
      return { title: 'Invite accepted', body: `${actor} joined with your invite` }
    case 'recommendations_ready':
      return { title: 'Recommendations ready', body: 'Your new recommendations are ready' }
    case 'reading_nudge':
      return {
        title: 'Keep your streak going',
        body: bookTitle
          ? `Update your progress on "${bookTitle}"`
          : 'Update your progress on your current read',
      }
    default:
      return { title: 'Inkli', body: 'You have a new notification' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const body = (await req.json()) as WebhookPayload
    const record = body?.record
    if (!record?.id || !record?.recipient_id || !record?.type) {
      return new Response(
        JSON.stringify({ error: 'Missing record.id, record.recipient_id, or record.type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Fetch full notification with actor and book for title/body
    const { data: notif, error: notifError } = await supabase
      .from('notifications')
      .select(
        `
        id,
        recipient_id,
        actor_id,
        type,
        user_book_id,
        actor:user_profiles!fk_notifications_actor(username),
        user_book:user_books!fk_notifications_user_book(book:books(title)),
        comment:activity_comments!fk_notifications_comment(comment_text)
      `
      )
      .eq('id', record.id)
      .single()

    if (notifError || !notif) {
      console.error('send-push fetch notification error:', notifError)
      return new Response(JSON.stringify({ error: 'Notification not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const row = notif as NotificationRow
    const actorName = row.actor?.username ?? null
    const bookTitle = row.user_book?.book?.title ?? null
    const { title, body } = buildTitleAndBody(
      row.type,
      actorName,
      bookTitle,
      row.comment?.comment_text
    )

    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('id, expo_push_token')
      .eq('user_id', row.recipient_id)

    if (tokensError || !tokens?.length) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: 'No push tokens for recipient' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const messages = tokens.map((t: { id: string; expo_push_token: string }) => ({
      to: t.expo_push_token,
      title,
      body,
      sound: 'default' as const,
      data: {
        notificationId: row.id,
        type: row.type,
        actorId: row.actor_id ?? undefined,
        userBookId: row.user_book_id ?? undefined,
      },
    }))

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    })

    const expoData = (await expoRes.json()) as {
      data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }>
      errors?: Array<{ message: string }>
    }

    if (!expoRes.ok) {
      console.error('Expo push send error:', expoRes.status, expoData)
      return new Response(
        JSON.stringify({ error: 'Expo push failed', details: expoData.errors ?? expoData }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ticketList = expoData.data ?? []
    const toInsert: { ticket_id: string; push_token_id: string }[] = []
    for (let i = 0; i < ticketList.length; i++) {
      const ticket = ticketList[i]
      const tokenRow = tokens[i] as { id: string; expo_push_token: string }
      if (ticket?.status === 'ok' && ticket.id) {
        toInsert.push({ ticket_id: ticket.id, push_token_id: tokenRow.id })
      }
      if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        await supabase.from('push_tokens').delete().eq('id', tokenRow.id)
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('push_send_tickets').insert(toInsert)
    }

    return new Response(
      JSON.stringify({ ok: true, sent: tokens.length, ticketsStored: toInsert.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
