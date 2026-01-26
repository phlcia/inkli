import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EnrichmentData {
  description?: string;
  cover_url?: string;
  isbn_13?: string;
  isbn_10?: string;
  page_count?: number;
  published_date?: string;
  publisher?: string;
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: {
    get: (key: string) => string | undefined
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })
    const supabaseDb = createClient(supabaseUrl, serviceRoleKey)

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { bookId, openlibraryId } = body || {}

    if (!bookId || !openlibraryId) {
      return new Response(
        JSON.stringify({ error: 'Missing bookId or openlibraryId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedId = String(openlibraryId).replace(/^\/works\//, '')
    const workPath = String(openlibraryId).startsWith('/works/')
      ? String(openlibraryId)
      : `/works/${normalizedId}`

    const olResponse = await fetch(`https://openlibrary.org${workPath}.json`)
    if (!olResponse.ok) {
      throw new Error(`Failed to fetch Open Library work: ${olResponse.status}`)
    }
    const olData = await olResponse.json()

    const enrichmentData: EnrichmentData = {}

    if (olData.description) {
      enrichmentData.description = typeof olData.description === 'string'
        ? olData.description
        : olData.description.value
    }

    if (olData.covers && olData.covers.length > 0) {
      enrichmentData.cover_url = `https://covers.openlibrary.org/b/id/${olData.covers[0]}-L.jpg`
    }

    const editionsResponse = await fetch(`https://openlibrary.org${workPath}/editions.json?limit=1`)
    if (editionsResponse.ok) {
      const editionsData = await editionsResponse.json()

      if (editionsData.entries && editionsData.entries.length > 0) {
        const edition = editionsData.entries[0]

        if (edition.isbn_13 && edition.isbn_13.length > 0) {
          enrichmentData.isbn_13 = edition.isbn_13[0]
        }
        if (edition.isbn_10 && edition.isbn_10.length > 0) {
          enrichmentData.isbn_10 = edition.isbn_10[0]
        }
        if (edition.number_of_pages) {
          enrichmentData.page_count = edition.number_of_pages
        }
        if (edition.publish_date) {
          const yearMatch = edition.publish_date.match(/\d{4}/)
          enrichmentData.published_date = yearMatch ? yearMatch[0] : edition.publish_date
        }
        if (edition.publishers && edition.publishers.length > 0) {
          enrichmentData.publisher = edition.publishers[0]
        }
      }
    }

    const { error: updateError } = await supabaseDb
      .from('books')
      .update(enrichmentData)
      .eq('id', bookId)

    if (updateError) {
      throw new Error(`Failed to update book: ${updateError.message}`)
    }

    const { data: updatedBook, error: fetchError } = await supabaseDb
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single()

    if (fetchError) {
      throw new Error(`Failed to fetch updated book: ${fetchError.message}`)
    }

    return new Response(
      JSON.stringify({ book: updatedBook }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Enrichment error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
