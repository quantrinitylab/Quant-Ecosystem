// ============================================================================
// QuanTube - Public & Guest Featured Videos
// Curated public fallback videos for unauthenticated guests, 401s, or offline states.
//
// Single source of truth: backend/lib/sample-catalog.ts (shared with the
// Fastify backend so /api/videos/:id serves the SAME records the cards link
// to). Everything here is sample content — consumers must surface the
// `isSample` flag instead of presenting these as real user uploads.
// ============================================================================

import {
  SAMPLE_CATALOG,
  findSampleVideo,
  type SampleVideo,
} from '../../backend/lib/sample-catalog';

export interface PublicFeaturedVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  thumbnailUrl: string;
  videoUrl: string;
  url: string;
  channelId: string;
  channelName: string;
  channelAvatar: string;
  views: number;
  uploadedAt: string;
  duration: number;
  isLive?: boolean;
  category: string;
  resolution?: string;
  /** Always true for these records — render a "Sample" badge, never fake stats. */
  isSample: true;
}

function toPublicFeaturedVideo(v: SampleVideo): PublicFeaturedVideo {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    thumbnail: v.thumbnailUrl,
    thumbnailUrl: v.thumbnailUrl,
    videoUrl: v.videoUrl,
    url: `/watch/${v.id}`,
    channelId: v.channelId,
    channelName: v.channelName,
    channelAvatar: v.channelAvatar,
    views: v.views,
    uploadedAt: v.uploadedAt,
    duration: v.duration,
    isLive: v.isLive,
    category: v.category,
    resolution: v.resolution,
    isSample: true,
  };
}

export const PUBLIC_FEATURED_VIDEOS: PublicFeaturedVideo[] =
  SAMPLE_CATALOG.map(toPublicFeaturedVideo);

export function getGuestFeaturedVideos(category?: string): PublicFeaturedVideo[] {
  if (!category || category === 'all' || category === 'undefined') {
    return PUBLIC_FEATURED_VIDEOS;
  }
  const filtered = PUBLIC_FEATURED_VIDEOS.filter(
    (v) => v.category.toLowerCase() === category.toLowerCase(),
  );
  return filtered.length > 0 ? filtered : PUBLIC_FEATURED_VIDEOS;
}

/**
 * Watch-page shape for a sample id, or undefined for unknown ids.
 * Used as the client-side fallback when the API has no record (empty catalog),
 * so /watch/<sample-id> always resolves to a REAL playable videoUrl.
 */
export interface WatchSampleVideo {
  id: string;
  title: string;
  description: string;
  /** Watch page reads `v.videoUrl || v.url` — both are populated. */
  videoUrl: string;
  url: string;
  thumbnailUrl: string;
  channelId: string;
  channelName: string;
  channelAvatar: string;
  views: number;
  publishedAt: string;
  uploadedAt: string;
  duration: number;
  isLive: boolean;
  category: string;
  resolution?: string;
  isSample: true;
}

export function resolveWatchVideo(id: string): WatchSampleVideo | undefined {
  const v = findSampleVideo(id);
  if (!v) return undefined;
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    videoUrl: v.videoUrl,
    url: `/watch/${v.id}`,
    thumbnailUrl: v.thumbnailUrl,
    channelId: v.channelId,
    channelName: v.channelName,
    channelAvatar: v.channelAvatar,
    views: v.views,
    publishedAt: v.uploadedAt,
    uploadedAt: v.uploadedAt,
    duration: v.duration,
    isLive: v.isLive ?? false,
    category: v.category,
    resolution: v.resolution,
    isSample: true,
  };
}
