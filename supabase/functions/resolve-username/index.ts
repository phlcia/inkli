// Supabase Edge Function: Resolve username to email for password sign-in
// Usage: invoke via supabase.functions.invoke('resolve-username', { body: { username } })

// @ts-expect-error - Deno types are available at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Declare Deno global for TypeScript (available at runtime in Supabase Edge Functions)
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

// @ts-expect-error - Deno.serve is available in Supabase Edge Functions runtime
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const rawUsername = (body?.username ?? '').toString().trim()

    if (!rawUsername) {
      return new Response(
        JSON.stringify({ error: 'Username is required' }),
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

    const username = rawUsername.toLowerCase()
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', username)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    if (!profile?.user_id) {
      return new Response(
        JSON.stringify({ error: 'Username not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      profile.user_id
    )

    if (userError) {
      throw userError
    }

    const email = userData?.user?.email ?? ''
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email not found for username' }),
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
    console.error('Resolve username error:', error)
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
