import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { getGuestFeaturedVideos } from '../data/public-videos';
import type { Video } from '../types';

export interface VideoPageResult {
  videos: Video[] | any[];
  page: number;
  isGuestFallback?: boolean;
}

export function useVideos(category?: string, limit: number = 20) {
  return useInfiniteQuery<VideoPageResult>({
    queryKey: ['videos', category],
    queryFn: async ({ pageParam = 1 }) => {
      const pageNum = Number(pageParam) || 1;
      try {
        const response = await apiClient.getVideos({ page: pageNum, limit, category });
        if (response && response.success && response.data) {
          const rawVideos =
            (response.data as any)?.videos ??
            (Array.isArray(response.data)
              ? response.data
              : Array.isArray((response.data as any)?.data)
                ? (response.data as any).data
                : []);

          if (rawVideos.length > 0) {
            return {
              videos: rawVideos,
              page: pageNum,
              isGuestFallback: false,
            };
          }
        }
      } catch (_err) {
        // Fall back to guest featured videos on first page
      }

      // If unauthenticated / 401 or empty data, return public featured videos
      if (pageNum === 1) {
        const fallback = getGuestFeaturedVideos(category);
        return {
          videos: fallback,
          page: 1,
          isGuestFallback: true,
        };
      }

      return {
        videos: [],
        page: pageNum,
        isGuestFallback: true,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.isGuestFallback || lastPage.videos.length < limit) return undefined;
      return lastPage.page + 1;
    },
    retry: 1,
  });
}

export default useVideos;
