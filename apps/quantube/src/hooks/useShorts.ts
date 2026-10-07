// ============================================================================
// QuantTube - useShorts Hook
// Shorts feed state, navigation, interactions
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

interface ShortVideo {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  creator: string;
  creatorAvatar: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  soundName: string;
  duration: number;
  isSubscribed: boolean;
}

interface ShortsState {
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  liked: Set<string>;
  animatingLike: string | null;
}

interface ShortsActions {
  next: () => void;
  previous: () => void;
  goToIndex: (index: number) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  like: (shortId: string) => void;
  unlike: (shortId: string) => void;
  share: (shortId: string) => void;
  subscribe: (creatorId: string) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useShorts(): [
  ShortsState & { shorts: ShortVideo[]; loading: boolean; error: string | null; hasMore: boolean },
  ShortsActions,
] {
  const [localState, setLocalState] = useState<ShortsState>({
    currentIndex: 0,
    isPlaying: true,
    isMuted: false,
    liked: new Set(),
    animatingLike: null,
  });

  const likeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shortsQuery = useInfiniteQuery({
    queryKey: ['shorts'],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await apiClient.getShorts();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load shorts');
      }
      return {
        shorts: (response.data?.shorts ?? []) as ShortVideo[],
        nextPage: pageParam + 1,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.shorts.length === 0) return undefined;
      return lastPage.nextPage;
    },
  });

  const allShorts = shortsQuery.data?.pages.flatMap((page) => page.shorts) ?? [];

  const next = useCallback(() => {
    setLocalState((prev) => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, allShorts.length - 1),
    }));
  }, [allShorts.length]);

  const previous = useCallback(() => {
    setLocalState((prev) => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
    }));
  }, []);

  const goToIndex = useCallback((index: number) => {
    setLocalState((prev) => ({ ...prev, currentIndex: index }));
  }, []);

  const togglePlay = useCallback(() => {
    setLocalState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const toggleMute = useCallback(() => {
    setLocalState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const like = useCallback((shortId: string) => {
    setLocalState((prev) => {
      const newLiked = new Set(prev.liked);
      newLiked.add(shortId);
      return { ...prev, liked: newLiked, animatingLike: shortId };
    });
    if (likeTimerRef.current) clearTimeout(likeTimerRef.current);
    likeTimerRef.current = setTimeout(() => {
      setLocalState((prev) => ({ ...prev, animatingLike: null }));
    }, 600);
    apiClient.like(shortId);
  }, []);

  const unlike = useCallback((shortId: string) => {
    setLocalState((prev) => {
      const newLiked = new Set(prev.liked);
      newLiked.delete(shortId);
      return { ...prev, liked: newLiked };
    });
  }, []);

  const share = useCallback((shortId: string) => {
    // Tracked via API interaction
  }, []);

  const subscribe = useCallback((creatorId: string) => {
    apiClient.subscribe(creatorId);
  }, []);

  const loadMore = useCallback(async () => {
    if (shortsQuery.hasNextPage) {
      await shortsQuery.fetchNextPage();
    }
  }, [shortsQuery]);

  const refresh = useCallback(async () => {
    setLocalState((prev) => ({ ...prev, currentIndex: 0 }));
    await shortsQuery.refetch();
  }, [shortsQuery]);

  // Auto-load more when approaching end
  useEffect(() => {
    if (
      localState.currentIndex >= allShorts.length - 3 &&
      shortsQuery.hasNextPage &&
      !shortsQuery.isFetchingNextPage
    ) {
      shortsQuery.fetchNextPage();
    }
  }, [localState.currentIndex, allShorts.length, shortsQuery]);

  const state = {
    shorts: allShorts,
    currentIndex: localState.currentIndex,
    isPlaying: localState.isPlaying,
    isMuted: localState.isMuted,
    liked: localState.liked,
    loading: shortsQuery.isLoading,
    error: shortsQuery.error?.message || null,
    hasMore: !!shortsQuery.hasNextPage,
    animatingLike: localState.animatingLike,
  };

  return [
    state,
    {
      next,
      previous,
      goToIndex,
      togglePlay,
      toggleMute,
      like,
      unlike,
      share,
      subscribe,
      loadMore,
      refresh,
    },
  ];
}

export default useShorts;
