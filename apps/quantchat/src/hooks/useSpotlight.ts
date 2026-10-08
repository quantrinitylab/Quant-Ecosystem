// ============================================================================
// QuantChat - useSpotlight Hook (Tasks 13.5, 13.6, 13.8)
//
// Fetches the curated Spotlight feed (engagement-ranked, personalized when
// @quant/recommendation is available on the backend). The ranking is cached
// server-side and refreshed every 15 minutes; the hook re-fetches on that same
// cadence so the client stays in sync with the rotating ranking (Task 13.6).
// ============================================================================
'use client';

import { useQuery } from '@tanstack/react-query';
import { getAuthHeaders } from '../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

export interface SpotlightReel {
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
  engagementScore: number;
  isFeatured: boolean;
}

interface SpotlightResponse {
  success: boolean;
  data: {
    reels: SpotlightReel[];
    rankedAt: string;
    refreshIntervalMs: number;
    personalized: boolean;
    total: number;
  };
}

/** Spotlight ranking refresh cadence (15 minutes — Task 13.6). */
export const SPOTLIGHT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export interface UseSpotlightReturn {
  reels: SpotlightReel[];
  featured: SpotlightReel[];
  rankedAt: string | null;
  personalized: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

async function fetchSpotlight(): Promise<SpotlightResponse['data']> {
  const res = await apiFetchRaw('/api/spotlight', { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error(`Failed to load Spotlight: ${res.statusText}`);
  const json: SpotlightResponse = await res.json();
  // A non-success or malformed payload must surface the error state (with
  // Retry) instead of silently resolving to an empty list, which used to
  // render a completely black, content-less page.
  if (!json?.success || !json.data || !Array.isArray(json.data.reels)) {
    throw new Error('Failed to load Spotlight: unexpected response');
  }
  return json.data;
}

export function useSpotlight(): UseSpotlightReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['spotlight'],
    queryFn: fetchSpotlight,
    // Keep the client aligned with the 15-minute server ranking refresh.
    staleTime: SPOTLIGHT_REFRESH_INTERVAL_MS,
    refetchInterval: SPOTLIGHT_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  const reels = data?.reels ?? [];

  return {
    reels,
    featured: reels.filter((r) => r.isFeatured),
    rankedAt: data?.rankedAt ?? null,
    personalized: data?.personalized ?? false,
    isLoading,
    isError,
    refetch,
  };
}

export default useSpotlight;
