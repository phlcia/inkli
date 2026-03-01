// Supabase Edge Function: Poll Expo push receipts and remove dead tokens
// Run on a schedule (e.g. every 5 min via cron or Supabase scheduled invocation) after
// send-push has stored ticket IDs. Expo recommends waiting a few minutes after send before
// calling getReceipts. Deletes tokens that returned DeviceNotRegistered (or similar).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPO_GET_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

// Only poll tickets that are at least this old (Expo needs a few seconds to a few minutes)
const RECEIPT_DELAY_MINUTES = 2

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

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const cutoff = new Date(Date.now() - RECEIPT_DELAY_MINUTES * 60 * 1000).toISOString()
    const { data: tickets, error: ticketsError } = await supabase
      .from('push_send_tickets')
      .select('id, ticket_id, push_token_id')
      .lt('created_at', cutoff)
      .limit(1000)

    if (ticketsError || !tickets?.length) {
      return new Response(
        JSON.stringify({ ok: true, polled: 0, removed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ids = tickets.map((t: { ticket_id: string }) => t.ticket_id)
    const res = await fetch(EXPO_GET_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })

    const receiptData = (await res.json()) as {
      data?: Record<
        string,
        { status: string; details?: { error?: string } }
      >
      errors?: Array<{ message: string }>
    }

    if (!res.ok) {
      console.error('Expo getReceipts error:', res.status, receiptData)
      return new Response(
        JSON.stringify({ error: 'Expo getReceipts failed', details: receiptData.errors }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const receiptMap = receiptData.data ?? {}
    const ticketIdsToDelete: string[] = []
    const pushTokenIdsToRemove = new Set<string>()

    for (const t of tickets as Array<{ id: string; ticket_id: string; push_token_id: string }>) {
      const receipt = receiptMap[t.ticket_id]
      ticketIdsToDelete.push(t.id)
      if (receipt?.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        pushTokenIdsToRemove.add(t.push_token_id)
      }
    }

    for (const pushTokenId of pushTokenIdsToRemove) {
      await supabase.from('push_tokens').delete().eq('id', pushTokenId)
    }

    if (ticketIdsToDelete.length > 0) {
      await supabase.from('push_send_tickets').delete().in('id', ticketIdsToDelete)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        polled: tickets.length,
        removed: pushTokenIdsToRemove.size,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('push-receipts error:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
