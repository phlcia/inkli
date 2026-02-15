// Supabase Edge Function: Resolve phone to email for password sign-in
// Usage: invoke via supabase.functions.invoke('resolve-phone', { body: { phone } })
// Rate limiting: use Supabase built-in Edge Function rate limiting (dashboard/config)

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

const corsHeaders = {
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

// @ts-expect-error - Deno.serve is available in Supabase Edge Functions runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const rawPhone = (body?.phone ?? '').toString().trim()

    if (!rawPhone) {
      return new Response(
        JSON.stringify({ error: 'Phone is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const normalized = normalizePhoneE164(rawPhone)
    if (!normalized) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or service role key')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: privateRow, error: privateError } = await supabase
      .from('user_private_data')
      .select('user_id')
      .eq('phone_number', normalized)
      .maybeSingle()

    if (privateError) {
      throw privateError
    }

    if (!privateRow?.user_id) {
      return new Response(
        JSON.stringify({ error: 'No account found with that phone number' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      privateRow.user_id
    )

    if (userError) {
      throw userError
    }

    const email = userData?.user?.email ?? ''
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email not found for phone' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ email }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Resolve phone error:', error)
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
