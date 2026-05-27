// ============================================================================
// QuantMax - useFeed Hook
// TikTok-style feed state management with preloading (next 2), current index,
// swipe tracking, like with debounce, engagement time per video, skip detection,
// watch completion rate, autoplay next, pause/resume, mute toggle
// Powered by React Query + apiClient
// ============================================================================

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { ShortVideo } from '../types';

interface EngagementData {
  videoId: string;
  watchTime: number;
  startTime: number;
  completionRate: number;
  loops: number;
  liked: boolean;
  skipped: boolean;
}

interface FeedState {
  videos: ShortVideo[];
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
}

interface UseFeedReturn {
  state: FeedState;
  currentVideo: ShortVideo | null;
  preloadedVideos: ShortVideo[];
  engagementData: Map<string, EngagementData>;
  swipeToNext: () => void;
  swipeToPrevious: () => void;
  toggleLike: () => void;
  toggleMute: () => void;
  togglePlay: () => void;
  loadMore: () => void;
  trackSwipe: (direction: 'up' | 'down', distance: number) => void;
  getCompletionRate: (videoId: string) => number;
  getSkipRate: () => number;
}

const PRELOAD_COUNT = 2;
const SKIP_THRESHOLD_SECONDS = 3;
const LIKE_DEBOUNCE_MS = 300;

export function useFeed(): UseFeedReturn {
  const feedQuery = useInfiniteQuery({
    queryKey: ['max-feed'],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await apiClient.getForYouFeed(20, pageParam * 20);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load feed');
      }
      return {
        videos: response.data ?? [],
        nextPage: pageParam + 1,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.videos.length < 20) return undefined;
      return lastPage.nextPage;
    },
  });

  const engagementMutation = useMutation({
    mutationFn: async ({ videoId, data }: { videoId: string; data: Record<string, unknown> }) => {
      await apiClient.recordEngagement(videoId, data);
    },
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [engagementData, setEngagementData] = useState<Map<string, EngagementData>>(new Map());

  const watchStartRef = useRef<number>(Date.now());
  const likeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allVideos: ShortVideo[] = useMemo(
    () => (feedQuery.data?.pages ?? []).flatMap((page) => page.videos),
    [feedQuery.data],
  );

  const currentVideo = useMemo(() => {
    return allVideos[currentIndex] || null;
  }, [allVideos, currentIndex]);

  const preloadedVideos = useMemo(() => {
    const start = currentIndex + 1;
    const end = Math.min(start + PRELOAD_COUNT, allVideos.length);
    return allVideos.slice(start, end);
  }, [allVideos, currentIndex]);

  const markSkipIfNeeded = useCallback(
    (videoId: string) => {
      const elapsed = (Date.now() - watchStartRef.current) / 1000;
      if (elapsed < SKIP_THRESHOLD_SECONDS) {
        setEngagementData((prev) => {
          const next = new Map(prev);
          const data = next.get(videoId);
          if (data) {
            next.set(videoId, { ...data, skipped: true });
          }
          return next;
        });
        engagementMutation.mutate({ videoId, data: { skipped: true, watchTime: elapsed } });
      }
    },
    [engagementMutation],
  );

  const swipeToNext = useCallback(() => {
    if (currentIndex >= allVideos.length - 1) return;
    const currentId = allVideos[currentIndex]?.id;
    if (currentId) markSkipIfNeeded(currentId);
    setCurrentIndex((prev) => prev + 1);
    setIsPlaying(true);
    watchStartRef.current = Date.now();
  }, [currentIndex, allVideos, markSkipIfNeeded]);

  const swipeToPrevious = useCallback(() => {
    if (currentIndex <= 0) return;
    setCurrentIndex((prev) => prev - 1);
    setIsPlaying(true);
    watchStartRef.current = Date.now();
  }, [currentIndex]);

  const toggleLike = useCallback(() => {
    if (likeDebounceRef.current) clearTimeout(likeDebounceRef.current);
    likeDebounceRef.current = setTimeout(() => {
      if (currentVideo) {
        setEngagementData((prev) => {
          const next = new Map(prev);
          const data = next.get(currentVideo.id);
          if (data) {
            next.set(currentVideo.id, { ...data, liked: !data.liked });
          }
          return next;
        });
        engagementMutation.mutate({ videoId: currentVideo.id, data: { liked: true } });
      }
    }, LIKE_DEBOUNCE_MS);
  }, [currentVideo, engagementMutation]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const loadMore = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [feedQuery]);

  const trackSwipe = useCallback(
    (direction: 'up' | 'down', _distance: number) => {
      if (direction === 'up') {
        swipeToNext();
      } else if (direction === 'down') {
        swipeToPrevious();
      }
    },
    [swipeToNext, swipeToPrevious],
  );

  const getCompletionRate = useCallback(
    (videoId: string): number => {
      const data = engagementData.get(videoId);
      return data ? data.completionRate : 0;
    },
    [engagementData],
  );

  const getSkipRate = useCallback((): number => {
    if (engagementData.size === 0) return 0;
    let skipped = 0;
    engagementData.forEach((data) => {
      if (data.skipped) skipped++;
    });
    return skipped / engagementData.size;
  }, [engagementData]);

  // Auto-load more when approaching end
  useEffect(() => {
    if (
      currentIndex >= allVideos.length - 3 &&
      feedQuery.hasNextPage &&
      !feedQuery.isFetchingNextPage
    ) {
      feedQuery.fetchNextPage();
    }
  }, [currentIndex, allVideos.length, feedQuery.hasNextPage, feedQuery.isFetchingNextPage]);

  const state: FeedState = {
    videos: allVideos,
    currentIndex,
    isPlaying,
    isMuted,
    isLoading: feedQuery.isLoading || feedQuery.isFetchingNextPage,
    hasMore: feedQuery.hasNextPage ?? false,
    error: feedQuery.error?.message ?? null,
  };

  return {
    state,
    currentVideo,
    preloadedVideos,
    engagementData,
    swipeToNext,
    swipeToPrevious,
    toggleLike,
    toggleMute,
    togglePlay,
    loadMore,
    trackSwipe,
    getCompletionRate,
    getSkipRate,
  };
}

export default useFeed;
