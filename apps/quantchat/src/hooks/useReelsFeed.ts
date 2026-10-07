// ============================================================================
// QuantChat - useReelsFeed Hook
// Ranking integration hook for the Reels feed
// Fetches reels from /api/reels/feed, returns ranked feed with pagination
// ============================================================================
'use client';

import { useCallback, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Reel {
  id: string;
  creatorId: string;
  creatorUsername: string;
  creatorAvatar: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  createdAt: string;
  isLikedByUser: boolean;
}

interface ReelsFeedPage {
  reels: Reel[];
  nextCursor: string | null;
  hasMore: boolean;
  totalAvailable: number;
}

interface ReelsFeedResponse {
  success: boolean;
  data: ReelsFeedPage;
}

interface UseReelsFeedReturn {
  reels: Reel[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  fetchNextPage: () => void;
  hasMore: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  likeReel: (reelId: string) => void;
  unlikeReel: (reelId: string) => void;
  shareReel: (reelId: string) => void;
  addComment: (reelId: string, text: string) => void;
}

const FEED_LIMIT = 10;

async function fetchReelsFeed(cursor?: string): Promise<ReelsFeedPage> {
  const params = new URLSearchParams({ limit: String(FEED_LIMIT) });
  if (cursor) params.set('cursor', cursor);

  const response = await fetch(`/api/reels/feed?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch reels feed: ${response.statusText}`);
  }
  const json: ReelsFeedResponse = await response.json();
  return json.data;
}

export function useReelsFeed(): UseReelsFeedReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['reels-feed'],
    queryFn: ({ pageParam }) => fetchReelsFeed(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // Flatten all pages into a single reels array (backend returns pre-ranked via @quant/ranking)
  const reels: Reel[] = data?.pages.flatMap((page) => page.reels) ?? [];
  const hasMore = hasNextPage ?? false;

  // Optimistic like mutation
  const likeMutation = useMutation({
    mutationFn: async (reelId: string) => {
      const res = await fetch(`/api/reels/${reelId}/like`, { method: 'POST' });
      if (!res.ok) throw new Error('Like failed');
      return res.json();
    },
    onMutate: async (reelId: string) => {
      await queryClient.cancelQueries({ queryKey: ['reels-feed'] });
      const previousData = queryClient.getQueryData(['reels-feed']);

      queryClient.setQueryData(['reels-feed'], (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            reels: page.reels.map((reel) =>
              reel.id === reelId
                ? { ...reel, likeCount: reel.likeCount + 1, isLikedByUser: true }
                : reel,
            ),
          })),
        };
      });

      return { previousData };
    },
    onError: (_err, _reelId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['reels-feed'], context.previousData);
      }
    },
  });

  // Unlike (optimistic rollback)
  const unlikeMutation = useMutation({
    mutationFn: async (reelId: string) => {
      const res = await fetch(`/api/reels/${reelId}/like`, { method: 'POST' });
      if (!res.ok) throw new Error('Unlike failed');
      return res.json();
    },
    onMutate: async (reelId: string) => {
      await queryClient.cancelQueries({ queryKey: ['reels-feed'] });
      const previousData = queryClient.getQueryData(['reels-feed']);

      queryClient.setQueryData(['reels-feed'], (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            reels: page.reels.map((reel) =>
              reel.id === reelId
                ? { ...reel, likeCount: Math.max(0, reel.likeCount - 1), isLikedByUser: false }
                : reel,
            ),
          })),
        };
      });

      return { previousData };
    },
    onError: (_err, _reelId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['reels-feed'], context.previousData);
      }
    },
  });

  // Share mutation
  const shareMutation = useMutation({
    mutationFn: async (reelId: string) => {
      const res = await fetch(`/api/reels/${reelId}/share`, { method: 'POST' });
      if (!res.ok) throw new Error('Share failed');
      return res.json();
    },
    onMutate: async (reelId: string) => {
      queryClient.setQueryData(['reels-feed'], (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            reels: page.reels.map((reel) =>
              reel.id === reelId ? { ...reel, shareCount: reel.shareCount + 1 } : reel,
            ),
          })),
        };
      });
    },
  });

  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: async ({ reelId, text }: { reelId: string; text: string }) => {
      const res = await fetch(`/api/reels/${reelId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Comment failed');
      return res.json();
    },
    onMutate: async ({ reelId }) => {
      queryClient.setQueryData(['reels-feed'], (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            reels: page.reels.map((reel) =>
              reel.id === reelId ? { ...reel, commentCount: reel.commentCount + 1 } : reel,
            ),
          })),
        };
      });
    },
  });

  const handleFetchNextPage = useCallback(() => {
    if (hasMore && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  return {
    reels,
    currentIndex,
    setCurrentIndex,
    fetchNextPage: handleFetchNextPage,
    hasMore,
    isLoading,
    isFetchingNextPage,
    likeReel: (reelId: string) => likeMutation.mutate(reelId),
    unlikeReel: (reelId: string) => unlikeMutation.mutate(reelId),
    shareReel: (reelId: string) => shareMutation.mutate(reelId),
    addComment: (reelId: string, text: string) => commentMutation.mutate({ reelId, text }),
  };
}

export default useReelsFeed;
