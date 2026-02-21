/**
 * Ask feature: get book recommendations from Grok via Supabase Edge Function.
 * All xAI API calls go through the grok-ask Edge Function; no API key on the client.
 */

import { supabase } from '../config/supabase';

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GrokBookSuggestion {
  title: string;
  author: string;
  reason: string;
  /** Original publication year when known (for matching first editions). */
  year?: number;
}

export interface GrokBookResponse {
  books: GrokBookSuggestion[];
  rawContent: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cached_tokens?: number;
  };
}

export class GrokMalformedJsonError extends Error {
  constructor(message: string, public rawContent: string) {
    super(message);
    this.name = 'GrokMalformedJsonError';
  }
}

function parseBooksFromContent(rawContent: string): GrokBookSuggestion[] {
  const trimmed = rawContent.trim()
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/i, '');
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new GrokMalformedJsonError('Response was not a JSON array', rawContent);
  }
  const books: GrokBookSuggestion[] = [];
  for (const item of parsed) {
    if (item && typeof item.title === 'string' && typeof item.author === 'string') {
      let year: number | undefined;
      if (typeof item.year === 'number' && Number.isFinite(item.year)) {
        year = item.year;
      } else if (typeof item.publishedYear === 'number' && Number.isFinite(item.publishedYear)) {
        year = item.publishedYear;
      } else if (typeof item.year === 'string' && /^\d{4}$/.test(item.year)) {
        year = parseInt(item.year, 10);
      }
      books.push({
        title: String(item.title),
        author: String(item.author),
        reason: typeof item.reason === 'string' ? item.reason : '',
        ...(year != null && year >= 1000 && year <= 2100 ? { year } : {}),
      });
    }
  }
  return books;
}

/**
 * Request book recommendations from Grok via the grok-ask Edge Function.
 * Conversation trimming, system prompt, and max_tokens are enforced server-side.
 */
export async function askGrokForBooks(
  messages: GrokMessage[],
  userContent: string,
  _options?: { signal?: AbortSignal }
): Promise<GrokBookResponse> {
  const { data, error } = await supabase.functions.invoke('grok-ask', {
    body: { messages, userContent },
  });

  if (error) {
    const message = error.message || 'Ask request failed';
    if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out')) {
      throw new Error('Request timed out');
    }
    throw new Error(message);
  }

  if (data?.error && typeof data.error === 'string') {
    if (data.error.toLowerCase().includes('timeout')) {
      throw new Error('Request timed out');
    }
    throw new Error(data.error);
  }

  const content = typeof data?.content === 'string' ? data.content : '';
  const usage = data?.usage;

  if (usage && (usage.input_tokens != null || usage.output_tokens != null)) {
    const cached = usage.cached_tokens ?? 0;
    if (__DEV__) {
      console.debug('grok usage', {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cached_tokens: cached,
      });
    }
  }

  try {
    const books = parseBooksFromContent(content);
    return { books, rawContent: content, usage };
  } catch (e) {
    if (e instanceof GrokMalformedJsonError) {
      throw e;
    }
    throw new GrokMalformedJsonError(
      e instanceof Error ? e.message : 'Invalid JSON from Ask',
      content
    );
  }
}
