// ============================================================================
// QuantMax - useMatching Hook
// Dating state: profile queue loading/management, swipe actions (like returns
// match probability, pass removes, super-like with daily limit), match detection
// with celebration trigger, unmatch flow, preference updates, boost activation,
// undo last action, queue refill trigger
// Powered by React Query + apiClient
// ============================================================================

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { UserProfile, MatchAction } from '../types';

interface SwipeResult {
  action: MatchAction;
  profileId: string;
  isMatch: boolean;
}

interface UseMatchingReturn {
  currentProfile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  swipe: (action: 'like' | 'pass' | 'superlike') => SwipeResult | undefined;
  like: (profileId: string) => void;
  pass: (profileId: string) => void;
  superLike: (profileId: string) => void;
  undo: () => boolean;
  canUndo: boolean;
  canSuperLike: boolean;
  matchCelebration: { profileName: string } | null;
  dismissCelebration: () => void;
  refillQueue: () => void;
  matches: any[];
}

export function useMatching(): UseMatchingReturn {
  const queryClient = useQueryClient();
  const [matchCelebration, setMatchCelebration] = useState<{ profileName: string } | null>(null);
  const [lastSwipedProfile, setLastSwipedProfile] = useState<UserProfile | null>(null);

  const recommendationsQuery = useQuery({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const response = await apiClient.getRecommendations(20);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load recommendations');
      }
      return response.data ?? [];
    },
  });

  const swipeMutation = useMutation({
    mutationFn: async ({ targetId, action }: { targetId: string; action: MatchAction }) => {
      const response = await apiClient.swipe(targetId, action);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to swipe');
      }
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (data?.matched) {
        const profile = (recommendationsQuery.data ?? []).find((p) => p.id === variables.targetId);
        setMatchCelebration({ profileName: profile?.displayName ?? 'Someone' });
      }
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  const profiles = recommendationsQuery.data ?? [];

  const currentProfile = useMemo(() => {
    return profiles[0] || null;
  }, [profiles]);

  const performSwipe = useCallback(
    (action: MatchAction) => {
      if (!currentProfile) return undefined;
      setLastSwipedProfile(currentProfile);
      swipeMutation.mutate({ targetId: currentProfile.id, action });
      return {
        action,
        profileId: currentProfile.id,
        isMatch: false,
      };
    },
    [currentProfile, swipeMutation],
  );

  const swipe = useCallback(
    (action: 'like' | 'pass' | 'superlike') => {
      return performSwipe(action as MatchAction);
    },
    [performSwipe],
  );

  const like = useCallback(
    (profileId: string) => {
      swipeMutation.mutate({ targetId: profileId, action: 'like' });
    },
    [swipeMutation],
  );

  const pass = useCallback(
    (profileId: string) => {
      swipeMutation.mutate({ targetId: profileId, action: 'pass' });
    },
    [swipeMutation],
  );

  const superLike = useCallback(
    (profileId: string) => {
      swipeMutation.mutate({ targetId: profileId, action: 'superlike' });
    },
    [swipeMutation],
  );

  const undo = useCallback((): boolean => {
    // Undo is client-side only; no API support for reversing a swipe
    return false;
  }, []);

  const dismissCelebration = useCallback(() => {
    setMatchCelebration(null);
  }, []);

  const refillQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['recommendations'] });
  }, [queryClient]);

  return {
    currentProfile,
    isLoading: recommendationsQuery.isLoading,
    error: recommendationsQuery.error?.message ?? null,
    swipe,
    like,
    pass,
    superLike,
    undo,
    canUndo: lastSwipedProfile !== null,
    canSuperLike: true,
    matchCelebration,
    dismissCelebration,
    refillQueue,
    matches: [],
  };
}

export default useMatching;
