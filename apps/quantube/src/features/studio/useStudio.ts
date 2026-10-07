'use client';
// ============================================================================
// quantube — studio data hooks (Layer-5 read seam)
// ============================================================================
//
// Creator Studio used to render three hardcoded constants (MOCK_VIDEOS,
// MOCK_ANALYTICS, MOCK_COMMENTS) behind a `setTimeout` that imitated a network
// call, so every creator saw the same invented figures — five demo videos,
// 1.25M views, and $8,750.50 of revenue that never existed.
//
// These hooks bind the page to the real shipped backends via `useApiQuery`
// like every other wired quantube surface (never an inline `fetch`):
//
//   GET /api/videos/mine       -> { data: { data: Video[], total, ... } }
//                                (VideoService.listByUser — the caller's own
//                                uploads, no demo substitution)
//   GET /api/creator/dashboard  -> { overview }  (CreatorDashboardService)
//   GET /api/creator/earnings   -> { breakdown }  (MonetizationEngine)
//
// Surfaces with no backend at all — the comment moderation queue, community
// posts, watch hours, subscriber counts, and trend deltas — are NOT re-faked:
// the page renders honest "not available yet" empty states for those instead.
import { useApiQuery } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';

/** Mirrors the backend `Video` shape as it crosses JSON (Date -> string). */
export interface StudioVideo {
  id: string;
  userId: string;
  channelId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: number;
  visibility: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface MyVideosResponse {
  data: StudioVideo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Mirrors `@quant/creator-economy` `DashboardOverview`. */
export interface DashboardOverview {
  creatorId: string;
  tier: string;
  totalEarnings: number;
  availableBalance: number;
  pendingPayouts: number;
  activePartnerships: number;
}

export interface DashboardResponse {
  overview: DashboardOverview;
}

/** GET /api/videos/mine — the caller's own uploaded videos. */
export function useMyVideos(options?: UseApiQueryOptions) {
  return useApiQuery<MyVideosResponse>('/api/videos/mine', {
    params: { pageSize: '100' },
    ...options,
  });
}

/** GET /api/creator/dashboard — the caller's creator dashboard overview. */
export function useCreatorDashboard(options?: UseApiQueryOptions) {
  return useApiQuery<DashboardResponse>('/api/creator/dashboard', options);
}
