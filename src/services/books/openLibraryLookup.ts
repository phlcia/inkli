/**
 * Look up an Open Library work ID by title and optional author.
 * One quick search request; returns first result's key (e.g. /works/OL12345W) or null.
 */
export async function lookupOpenLibraryIdByTitleAuthor(
  title: string,
  author?: string
): Promise<string | null> {
  const query = [title, author].filter(Boolean).join(' ').trim();
  if (!query) return null;
  try {
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const key = data.docs?.[0]?.key;
    if (typeof key !== 'string' || !key.startsWith('/works/')) return null;
    return key;
  } catch {
    return null;
  }
}
