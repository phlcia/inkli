// Supabase Edge Function: Upsert book into public.books with validation
// Auth required: valid JWT in Authorization header

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

const MAX_TITLE_LEN = 200
const MAX_SUBTITLE_LEN = 200
const MAX_PUBLISHER_LEN = 200
const MAX_DESCRIPTION_LEN = 5000
const MAX_LANGUAGE_LEN = 10
const MAX_AUTHORS = 10
const MAX_AUTHOR_LEN = 200
const MAX_CATEGORIES = 10
const MAX_CATEGORY_LEN = 200
const MAX_GENRES = 15
const MAX_GENRE_LEN = 50

function cleanString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxLen) return null
  return trimmed
}

function cleanOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function cleanStringArray(value: unknown, maxItems: number, maxItemLen: number): string[] {
  if (!Array.isArray(value)) return []
  const cleaned = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxItemLen)
  return cleaned.slice(0, maxItems)
}

function cleanOpenLibraryId(value: unknown): string | null {
  const cleaned = cleanString(value, 64)
  if (!cleaned) return null
  if (!cleaned.startsWith('/works/')) return null
  return cleaned
}

function cleanGoogleBooksId(value: unknown): string | null {
  const cleaned = cleanString(value, 64)
  if (!cleaned) return null
  if (/\s/.test(cleaned)) return null
  return cleaned
}

function cleanIsbn13(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/[^0-9]/g, '')
  if (digits.length !== 13) return null
  return digits
}

function cleanIsbn10(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/[^0-9Xx]/g, '')
  if (digits.length !== 10) return null
  return digits.toUpperCase()
}

function sanitizeBook(input: Record<string, unknown>) {
  const title = cleanString(input.title, MAX_TITLE_LEN)
  if (!title) return { error: 'Missing or invalid title' }

  const openLibraryId = cleanOpenLibraryId(input.open_library_id)
  const googleBooksId = cleanGoogleBooksId(input.google_books_id)
  const isbn13 = cleanIsbn13(input.isbn_13)

  if (!openLibraryId && !googleBooksId && !isbn13) {
    return { error: 'Missing unique identifier (open_library_id, google_books_id, or isbn_13)' }
  }

  const book = {
    open_library_id: openLibraryId,
    google_books_id: googleBooksId,
    title,
    subtitle: cleanString(input.subtitle, MAX_SUBTITLE_LEN),
    authors: cleanStringArray(input.authors, MAX_AUTHORS, MAX_AUTHOR_LEN),
    publisher: cleanString(input.publisher, MAX_PUBLISHER_LEN),
    published_date: cleanString(input.published_date, 32),
    first_published: cleanOptionalNumber(input.first_published),
    description: cleanString(input.description, MAX_DESCRIPTION_LEN),
    page_count: cleanOptionalNumber(input.page_count),
    categories: cleanStringArray(input.categories, MAX_CATEGORIES, MAX_CATEGORY_LEN),
    genres: cleanStringArray(input.genres, MAX_GENRES, MAX_GENRE_LEN),
    average_rating: cleanOptionalNumber(input.average_rating),
    ratings_count: cleanOptionalNumber(input.ratings_count),
    language: cleanString(input.language, MAX_LANGUAGE_LEN),
    cover_url: cleanString(input.cover_url, 512),
    preview_link: cleanString(input.preview_link, 512),
    info_link: cleanString(input.info_link, 512),
    isbn_10: cleanIsbn10(input.isbn_10),
    isbn_13: isbn13,
  }

  return { book }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('URL') ?? ''
    const supabaseAnonKey = Deno.env.get('ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('EXPO_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: authError } = await userClient.auth.getUser()
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rawBook = (body as { book?: Record<string, unknown> }).book
    if (!rawBook || typeof rawBook !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Missing book payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { book, error } = sanitizeBook(rawBook)
    if (error || !book) {
      return new Response(
        JSON.stringify({ error: error || 'Invalid book data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const conflictKey = book.open_library_id
      ? 'open_library_id'
      : book.google_books_id
      ? 'google_books_id'
      : book.isbn_13
      ? 'isbn_13'
      : null

    if (!conflictKey) {
      return new Response(
        JSON.stringify({ error: 'No valid conflict key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    // First, check if book already exists
    const conflictValue = book.open_library_id || book.google_books_id || book.isbn_13
    const { data: existingBook } = await adminClient
      .from('books')
      .select('id, genres')
      .eq(conflictKey, conflictValue)
      .single()
    
    let finalBook = book
    if (existingBook) {
      // Book exists - preserve existing genres (don't overwrite with new auto-mapped ones)
      // This prevents one user's genre changes from affecting another user
      // User-specific genres are stored in user_books.user_genres instead
      finalBook = { ...book, genres: existingBook.genres }
    }
    
    const { data, error: upsertError } = await adminClient
      .from('books')
      .upsert(finalBook, { onConflict: conflictKey })
      .select()
      .single()

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: upsertError.message, details: upsertError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ book_id: data.id, book: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
