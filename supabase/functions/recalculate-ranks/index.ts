// Supabase Edge Function: Recalculate All Ranks
// This function can be called periodically to ensure data integrity
// Usage: Call via Supabase Dashboard or schedule with cron

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
    // Create Supabase client with service role key (bypasses RLS)
    // @ts-expect-error - Deno.env is available in Supabase Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-expect-error - Deno.env is available in Supabase Edge Functions runtime
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Running full rank recalculation...')
    
    // Call the database function to recalculate all ranks
    const { error } = await supabase.rpc('recalculate_all_ranks')

    if (error) {
      console.error('Recalculation error:', error)
      return new Response(
        JSON.stringify({ 
          error: error.message,
          details: error 
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Rank recalculation complete')
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'All ranks recalculated successfully',
        timestamp: new Date().toISOString()
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
