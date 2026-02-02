import { useCallback, useEffect, useRef, useState } from 'react';
import { getFriendsRankingsForBook } from '../../../services/books';
import type { UserBook } from '../../../services/books';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useFriendsRankings(params: {
  resolveBookIdForStats: () => Promise<string | null>;
  userId?: string | null;
  bookCacheKey: string;
}) {
  const { resolveBookIdForStats, userId, bookCacheKey } = params;
  const [friendsRankings, setFriendsRankings] = useState<
    Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>
  >([]);
  const [friendsRankingsLoading, setFriendsRankingsLoading] = useState(false);
  const [friendsRankingsError, setFriendsRankingsError] = useState<string | null>(null);
  const [friendsRankingsTotalCount, setFriendsRankingsTotalCount] = useState(0);
  const [friendsRankingsOffset, setFriendsRankingsOffset] = useState(0);
  const friendsRankingsCacheRef = useRef<
    Map<
      string,
      {
        rankings: Array<UserBook & { user_profile?: { user_id: string; username: string; profile_photo_url: string | null } }>;
        totalCount: number;
        timestamp: number;
      }
    >
  >(new Map());
  const friendsRankingsHasLoadedRef = useRef(false);
  const friendsRankingsLoadingRef = useRef(false);

  const loadFriendsRankings = useCallback(
    async (offset: number = 0, append: boolean = false) => {
      if (!userId || friendsRankingsLoadingRef.current) {
        return;
      }

      try {
        const resolvedBookId = await resolveBookIdForStats();
        if (!resolvedBookId) {
          setFriendsRankings([]);
          setFriendsRankingsTotalCount(0);
          setFriendsRankingsOffset(0);
          return;
        }

        const cacheKey = `${resolvedBookId}_${userId}`;
        const cached = friendsRankingsCacheRef.current.get(cacheKey);
        const now = Date.now();

        if (cached && now - cached.timestamp < CACHE_TTL && offset === 0 && !append) {
          setFriendsRankings(cached.rankings);
          setFriendsRankingsTotalCount(cached.totalCount);
          setFriendsRankingsOffset(cached.rankings.length);
          setFriendsRankingsError(null);
          friendsRankingsHasLoadedRef.current = true;
          return;
        }

        friendsRankingsLoadingRef.current = true;
        setFriendsRankingsLoading(true);
        setFriendsRankingsError(null);

        const result = await getFriendsRankingsForBook(resolvedBookId, userId, {
          offset,
          limit: 20,
        });

        if (append) {
          setFriendsRankings((prev) => [...prev, ...result.rankings]);
          setFriendsRankingsOffset((prev) => prev + result.rankings.length);
        } else {
          setFriendsRankings(result.rankings);
          setFriendsRankingsOffset(result.rankings.length);
          friendsRankingsCacheRef.current.set(cacheKey, {
            rankings: result.rankings,
            totalCount: result.totalCount,
            timestamp: now,
          });
        }
        setFriendsRankingsTotalCount(result.totalCount);
        friendsRankingsHasLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading friends rankings:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load friends rankings';
        setFriendsRankingsError(errorMessage);
        if (!append) {
          setFriendsRankings([]);
          setFriendsRankingsTotalCount(0);
          setFriendsRankingsOffset(0);
        }
      } finally {
        friendsRankingsLoadingRef.current = false;
        setFriendsRankingsLoading(false);
      }
    },
    [resolveBookIdForStats, userId]
  );

  useEffect(() => {
    friendsRankingsHasLoadedRef.current = false;
    setFriendsRankings([]);
    setFriendsRankingsTotalCount(0);
    setFriendsRankingsOffset(0);
    setFriendsRankingsError(null);
  }, [bookCacheKey]);

  useEffect(() => {
    if (friendsRankingsHasLoadedRef.current) {
      return;
    }
    loadFriendsRankings(0, false);
  }, [loadFriendsRankings]);

  const handleRetryFriendsRankings = useCallback(() => {
    setFriendsRankingsError(null);
    friendsRankingsHasLoadedRef.current = false;
    loadFriendsRankings(0, false);
  }, [loadFriendsRankings]);

  const handleShowMoreFriendsRankings = useCallback(() => {
    loadFriendsRankings(friendsRankingsOffset, true);
  }, [loadFriendsRankings, friendsRankingsOffset]);

  return {
    friendsRankings,
    friendsRankingsLoading,
    friendsRankingsError,
    friendsRankingsTotalCount,
    friendsRankingsOffset,
    handleRetryFriendsRankings,
    handleShowMoreFriendsRankings,
  };
}
