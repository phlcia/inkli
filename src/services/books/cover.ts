import type { GoogleBook } from './types';

/**
 * Get the highest quality cover URL from Google Books imageLinks
 * Prioritizes larger images and enhances thumbnail quality when needed
 */
export function getBestCoverUrl(
  imageLinks?: GoogleBook['volumeInfo']['imageLinks']
): string | null {
  if (!imageLinks) return null;

  // Try larger sizes first
  if (imageLinks.extraLarge) return imageLinks.extraLarge;
  if (imageLinks.large) return imageLinks.large;
  if (imageLinks.medium) return imageLinks.medium;
  if (imageLinks.small) return imageLinks.small;

  // Enhance thumbnail if available
  if (imageLinks.thumbnail) {
    return imageLinks.thumbnail
      .replace('&edge=curl', '') // Remove edge curl effect
      .replace('zoom=1', 'zoom=2') // Get 2x larger image
      .replace('zoom=2', 'zoom=3'); // Try even larger if already zoom=2
  }

  // Fallback to smallThumbnail
  if (imageLinks.smallThumbnail) {
    return imageLinks.smallThumbnail
      .replace('&edge=curl', '')
      .replace('zoom=1', 'zoom=2');
  }

  return null;
}
