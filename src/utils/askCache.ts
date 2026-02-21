/**
 * In-memory session cache for Ask (Grok) responses.
 * Reduces repeat calls for the same or similar queries within a session.
 */

import type { GrokBookResponse } from '../services/grok';

const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  value: GrokBookResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const SKIP_WORDS = [
  'different',
  'other',
  'instead',
  'not that',
  'else',
  'something else',
];

function normalizeMessage(msg: string): string {
  return msg
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** djb2-style hash for cache key. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * Returns a cache key for the given user message (normalized + hashed).
 */
export function getCacheKey(userMessage: string): string {
  return hashString(normalizeMessage(userMessage));
}

/**
 * Returns cached response if present and not expired; otherwise null.
 */
export function getCachedAskResponse(key: string): GrokBookResponse | null {
  const entry = cache.get(key);
  if (!entry) {
    if (__DEV__) {
      console.debug('askCache miss', key);
    }
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    if (__DEV__) {
      console.debug('askCache miss (expired)', key);
    }
    return null;
  }
  if (__DEV__) {
    console.debug('askCache hit', key);
  }
  return entry.value;
}

/**
 * Stores a response in the cache with TTL.
 */
export function setCachedAskResponse(key: string, value: GrokBookResponse): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * True if the user message suggests they want different results (skip cache).
 */
export function shouldSkipCache(userMessage: string): boolean {
  const normalized = normalizeMessage(userMessage);
  return SKIP_WORDS.some((word) => normalized.includes(word));
}
