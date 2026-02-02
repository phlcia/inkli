import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  blockUser,
  cancelFollowRequest,
  followUser,
  muteUser,
  unblockUser,
  unmuteUser,
  unfollowUser,
} from '../../../services/userProfile';

type UseFollowActionsParams = {
  currentUserId?: string | null;
  targetUserId: string;
  isFollowing: boolean;
  followRequestPending: boolean;
  blockedByViewer: boolean;
  isMuted: boolean;
  isFollowedByTarget: boolean;
  setIsFollowing: (value: boolean) => void;
  setFollowRequestPending: (value: boolean) => void;
  setFollowMenuOpen: (value: boolean) => void;
  setBlockedByViewer: (value: boolean) => void;
  setIsMuted: (value: boolean) => void;
  setIsFollowedByTarget: (value: boolean) => void;
  setFollowerCount: Dispatch<SetStateAction<number>>;
  setFollowingCount: Dispatch<SetStateAction<number>>;
  setFollowLoading: (value: boolean) => void;
  onError: (message: string) => void;
};

export function useFollowActions({
  currentUserId,
  targetUserId,
  isFollowing,
  followRequestPending,
  blockedByViewer,
  isMuted,
  isFollowedByTarget,
  setIsFollowing,
  setFollowRequestPending,
  setFollowMenuOpen,
  setBlockedByViewer,
  setIsMuted,
  setIsFollowedByTarget,
  setFollowerCount,
  setFollowingCount,
  setFollowLoading,
  onError,
}: UseFollowActionsParams) {
  const handleFollowToggle = useCallback(async () => {
    if (!currentUserId || currentUserId === targetUserId) return;

    setFollowLoading(true);
    try {
      if (blockedByViewer) {
        const { error } = await unblockUser(currentUserId, targetUserId);
        if (!error) {
          setBlockedByViewer(false);
        }
        return;
      }
      if (isFollowing) {
        const { error } = await unfollowUser(currentUserId, targetUserId);
        if (!error) {
          setIsFollowing(false);
          setFollowMenuOpen(false);
          setFollowerCount((prev) => Math.max(0, prev - 1));
        }
      } else if (followRequestPending) {
        const { error } = await cancelFollowRequest(currentUserId, targetUserId);
        if (!error) {
          setFollowRequestPending(false);
        }
      } else {
        const { action, error } = await followUser(currentUserId, targetUserId);
        if (!error) {
          if (action === 'following') {
            setIsFollowing(true);
            setFollowerCount((prev) => prev + 1);
            setFollowRequestPending(false);
          } else {
            setFollowRequestPending(true);
          }
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      onError('Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  }, [
    blockedByViewer,
    currentUserId,
    followRequestPending,
    isFollowing,
    setBlockedByViewer,
    setFollowLoading,
    setFollowMenuOpen,
    setFollowRequestPending,
    setFollowerCount,
    setIsFollowing,
    targetUserId,
    onError,
  ]);

  const handleMutePress = useCallback(() => {
    setFollowMenuOpen(false);
    if (!currentUserId || currentUserId === targetUserId) return;
    if (isMuted) {
      unmuteUser(currentUserId, targetUserId).then(({ error }) => {
        if (!error) setIsMuted(false);
      });
      return;
    }
    muteUser(currentUserId, targetUserId).then(({ error }) => {
      if (!error) setIsMuted(true);
    });
  }, [currentUserId, isMuted, setFollowMenuOpen, setIsMuted, targetUserId]);

  const handleBlockPress = useCallback(() => {
    setFollowMenuOpen(false);
    if (!currentUserId || currentUserId === targetUserId) return;
    if (blockedByViewer) {
      unblockUser(currentUserId, targetUserId).then(({ error }) => {
        if (!error) setBlockedByViewer(false);
      });
      return;
    }
  }, [blockedByViewer, currentUserId, setBlockedByViewer, setFollowMenuOpen, targetUserId]);

  const handleConfirmBlock = useCallback(async () => {
    if (!currentUserId || currentUserId === targetUserId) return;
    const { error } = await blockUser(currentUserId, targetUserId);
    if (!error) {
      setBlockedByViewer(true);
      if (isFollowing) {
        setFollowerCount((prev) => Math.max(0, prev - 1));
      }
      if (isFollowedByTarget) {
        setFollowingCount((prev) => Math.max(0, prev - 1));
      }
      setIsFollowing(false);
      setIsFollowedByTarget(false);
      setFollowRequestPending(false);
    }
  }, [
    currentUserId,
    isFollowedByTarget,
    isFollowing,
    setBlockedByViewer,
    setFollowerCount,
    setFollowingCount,
    setFollowRequestPending,
    setIsFollowedByTarget,
    setIsFollowing,
    targetUserId,
  ]);

  return {
    handleFollowToggle,
    handleMutePress,
    handleBlockPress,
    handleConfirmBlock,
  };
}
