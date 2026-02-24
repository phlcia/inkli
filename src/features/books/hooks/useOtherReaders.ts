import { useCallback, useEffect, useRef, useState } from 'react';
import { getOtherReadersForBook, type OtherReaderItem } from '../../../services/books';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useOtherReaders(params: {
  resolveBookIdForStats: () => Promise<string | null>;
  userId?: string | null;
  bookCacheKey: string;
}) {
  const { resolveBookIdForStats, userId, bookCacheKey } = params;
  const [otherReaders, setOtherReaders] = useState<OtherReaderItem[]>([]);
  const [otherReadersLoading, setOtherReadersLoading] = useState(false);
  const cacheRef = useRef<Map<string, { data: OtherReaderItem[]; timestamp: number }>>(new Map());
  const hasLoadedRef = useRef(false);
  const loadingRef = useRef(false);

  const loadOtherReaders = useCallback(async () => {
    if (!userId || loadingRef.current) return;

    try {
      const resolvedBookId = await resolveBookIdForStats();
      if (!resolvedBookId) {
        setOtherReaders([]);
        return;
      }

      const cacheKey = `other_${resolvedBookId}_${userId}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setOtherReaders(cached.data);
        hasLoadedRef.current = true;
        return;
      }

      loadingRef.current = true;
      setOtherReadersLoading(true);

      const result = await getOtherReadersForBook(resolvedBookId, userId, { limit: 20 });
      setOtherReaders(result);
      cacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() });
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading other readers:', error);
      setOtherReaders([]);
    } finally {
      loadingRef.current = false;
      setOtherReadersLoading(false);
    }
  }, [resolveBookIdForStats, userId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    setOtherReaders([]);
    cacheRef.current.clear();
  }, [bookCacheKey]);

  useEffect(() => {
    if (hasLoadedRef.current || !userId) return;
    loadOtherReaders();
  }, [loadOtherReaders, userId]);

  return { otherReaders, otherReadersLoading, loadOtherReaders };
}
