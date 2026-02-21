// Supabase Edge Function: Proxy to xAI Grok API for Ask feature
// Auth required: valid JWT in Authorization header
// Reads GROK_API_KEY and optional GROK_SYSTEM_PROMPT from Supabase secrets

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'
const GROK_MODEL = 'grok-4-1-fast-non-reasoning'
const MAX_TOKENS = 500
const GROK_TIMEOUT_MS = 10_000

// Grok 4.1 Fast: $0.20/1M input, $0.50/1M output (xAI pricing)
const COST_PER_1K_INPUT = 0.0002
const COST_PER_1K_OUTPUT = 0.0005
const API_USAGE_TRIGGER = 'ask_screen'

const DEFAULT_SYSTEM_PROMPT = `You are a book recommendation assistant. The user will describe a mood or vibe. Respond with a JSON array only, no other text or markdown. Each element must be: { "title": "Book Title", "author": "Author Name", "reason": "One sentence why it matches the mood", "year": 1999 } where year is the original publication year (number, 4 digits) when you know it. Give 3 to 5 books. Use well-known, real novels/books—not summaries, study guides, or companions.`

interface GrokMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Keep at most the last 4 turns (8 messages: user + assistant pairs). */
function trimToLastFourTurns(messages: GrokMessage[]): GrokMessage[] {
  const allowed = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  if (allowed.length <= 8) return allowed
  return allowed.slice(-8)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const grokApiKey = Deno.env.get('GROK_API_KEY') ?? ''
    const systemPrompt = Deno.env.get('GROK_SYSTEM_PROMPT')?.trim() || DEFAULT_SYSTEM_PROMPT

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }

    if (!grokApiKey) {
      return jsonResponse({ error: 'Ask service not configured' }, 503)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    let body: { messages?: GrokMessage[]; userContent?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Invalid request body' }, 400)
    }

    const { messages = [], userContent } = body
    const trimmedUserContent = typeof userContent === 'string' ? userContent.trim() : ''

    if (!trimmedUserContent) {
      return jsonResponse({ error: 'Missing or empty userContent' }, 400)
    }

    const history: GrokMessage[] = Array.isArray(messages)
      ? messages
          .filter((m): m is GrokMessage => m && typeof m === 'object' && typeof (m as GrokMessage).role === 'string' && typeof (m as GrokMessage).content === 'string')
          .map((m) => ({ role: m.role as GrokMessage['role'], content: String(m.content).slice(0, 8000) }))
      : []

    const lastFourTurns = trimToLastFourTurns(history)
    const grokMessages: GrokMessage[] = [
      { role: 'system', content: systemPrompt },
      ...lastFourTurns,
      { role: 'user', content: trimmedUserContent },
    ]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GROK_TIMEOUT_MS)

    const grokResponse = await fetch(GROK_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${grokApiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: grokMessages,
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
    }).finally(() => clearTimeout(timeoutId))

    if (!grokResponse.ok) {
      const errText = await grokResponse.text().catch(() => '')
      console.error('Grok API error:', grokResponse.status, errText)
      return jsonResponse(
        { error: grokResponse.status >= 500 ? 'Ask service temporarily unavailable' : 'Ask request failed' },
        grokResponse.status >= 500 ? 502 : 502
      )
    }

    let grokData: {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
      }
    }

    try {
      grokData = await grokResponse.json()
    } catch {
      return jsonResponse({ error: 'Invalid response from Ask service' }, 502)
    }

    const content = grokData?.choices?.[0]?.message?.content ?? ''
    const usage = grokData?.usage

    // Log token usage to api_usage for cost tracking (fire-and-forget; don't block response)
    if (usage && (usage.prompt_tokens != null || usage.completion_tokens != null)) {
      const promptTokens = usage.prompt_tokens ?? 0
      const completionTokens = usage.completion_tokens ?? 0
      const totalTokens = usage.total_tokens ?? promptTokens + completionTokens
      const estimatedCostUsd =
        (promptTokens / 1000) * COST_PER_1K_INPUT +
        (completionTokens / 1000) * COST_PER_1K_OUTPUT

      const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
      if (serviceRoleKey) {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
        supabaseAdmin
          .from('api_usage')
          .insert({
            user_id: user.id,
            model: GROK_MODEL,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            estimated_cost_usd: Math.round(estimatedCostUsd * 1e6) / 1e6,
            trigger: API_USAGE_TRIGGER,
          })
          .then(({ error }) => {
            if (error) console.error('api_usage insert error:', error)
          })
          .catch((e) => console.error('api_usage insert failed:', e))
      }
    }

    return jsonResponse(
      {
        content,
        usage: usage
          ? {
              input_tokens: usage.prompt_tokens ?? 0,
              output_tokens: usage.completion_tokens ?? 0,
              cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
            }
          : undefined,
      },
      200
    )
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return jsonResponse({ error: 'Request timed out' }, 504)
      }
      console.error('grok-ask error:', error)
      return jsonResponse({ error: error.message }, 500)
    }
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
