import { useCallback, useEffect, useState } from 'react';
import { getBookCircles, getBookShelfCounts } from '../../../services/books';
import type { BookCirclesResult, BookShelfCounts } from '../../../services/books';

export function useBookStats(params: {
  resolveBookIdForStats: () => Promise<string | null>;
  userId?: string | null;
}) {
  const { resolveBookIdForStats, userId } = params;
  const [circleStats, setCircleStats] = useState<BookCirclesResult | null>(null);
  const [circleLoading, setCircleLoading] = useState(false);
  const [circleError, setCircleError] = useState(false);
  const [shelfCounts, setShelfCounts] = useState<BookShelfCounts | null>(null);

  const refreshShelfCounts = useCallback(async () => {
    const resolvedBookId = await resolveBookIdForStats();
    if (!resolvedBookId) {
      setShelfCounts({
        read: 0,
        currently_reading: 0,
        want_to_read: 0,
      });
      return;
    }

    try {
      const counts = await getBookShelfCounts(resolvedBookId);
      setShelfCounts(counts);
    } catch (error) {
      console.error('Failed to refresh shelf counts:', error);
    }
  }, [resolveBookIdForStats]);

  useEffect(() => {
    let isActive = true;

    const loadCircles = async () => {
      setCircleLoading(true);
      setCircleError(false);

      try {
        const resolvedBookId = await resolveBookIdForStats();
        if (!resolvedBookId) {
          if (isActive) {
            setCircleStats(null);
            setShelfCounts({
              read: 0,
              currently_reading: 0,
              want_to_read: 0,
            });
          }
          return;
        }

        const [stats, counts] = await Promise.all([
          getBookCircles(resolvedBookId, userId),
          getBookShelfCounts(resolvedBookId),
        ]);
        if (isActive) {
          setCircleStats(stats);
          setShelfCounts(counts);
        }
      } catch (error) {
        console.error('Error loading book circles:', error);
        if (isActive) {
          setCircleError(true);
          setCircleStats(null);
          setShelfCounts({
            read: 0,
            currently_reading: 0,
            want_to_read: 0,
          });
        }
      } finally {
        if (isActive) {
          setCircleLoading(false);
        }
      }
    };

    loadCircles();

    return () => {
      isActive = false;
    };
  }, [resolveBookIdForStats, userId]);

  return {
    circleStats,
    circleLoading,
    circleError,
    shelfCounts,
    setShelfCounts,
    refreshShelfCounts,
  };
}
