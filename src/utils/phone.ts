import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Normalize phone input to E.164 format.
 * Returns null if invalid or unparseable.
 */
export function normalizePhone(
  input: string,
  defaultCountry: string = 'US'
): string | null {
  try {
    const phoneNumber = parsePhoneNumber(input, defaultCountry as any);
    return phoneNumber?.isValid() ? phoneNumber.format('E.164') : null;
  } catch {
    return null;
  }
}

/**
 * Check if input looks like a phone (digits, optional leading +).
 * Use before calling resolve-phone so only phone-like inputs hit the edge function.
 */
export function looksLikePhone(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.length) return false;
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.length >= 10 && /^\+?\d[\d\s\-()]*$/.test(trimmed);
}
