// ============================================================================
// quantube — library api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from the QuantTube Library UI surface to the
// backend: typed react-query hooks over the same-origin Next proxy paths
// (`/api/interactions/history`, `/api/playlists`, `/api/playlists/watch-later`)
// — never an inline fetch (Req 8.7). The proxy forwards the bearer +
// x-request-id to the backend (Layer 4), which reaches the decorated
// HistoryService / PlaylistService (Req 8.5, 8.6).
//
// Mirrors `features/creator/useCreator.ts` verbatim: read hooks wrap
// `useApiQuery`, write hooks wrap `useApiMutation`. The page-local interfaces
// in `pages/library.tsx` are the single authoritative response contracts
// (Req 8.8); they are imported here, never redefined.
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import { useQueryClient } from '@tanstack/react-query';
import type {
  HistoryListResponse,
  PlaylistData,
  PlaylistListResponse,
  WatchLaterItem,
  WatchLaterListResponse,
} from '../../pages/library';

/** Query-string params accepted by the watch-history read (Req 10.1, 10.2). */
export interface WatchHistoryParams {
  page?: number;
  pageSize?: number;
}

/** Input for creating a playlist (Req 2.14). */
export interface CreatePlaylistInput {
  title: string;
  visibility?: 'public' | 'private' | 'unlisted';
  description?: string;
}

/** Input for adding a video to Watch Later (Req 3.8). */
export interface AddWatchLaterInput {
  videoId: string;
}

/** Input for removing an entry from Watch Later (Req 3.9). */
export interface RemoveWatchLaterInput {
  entryId: string;
}

/**
 * GET /api/interactions/history — the caller's enriched watch history.
 * Optional `page`/`pageSize` are forwarded as query-string params exactly the
 * way `useApiQuery` passes them (they become part of the query key).
 */
export function useWatchHistory(params?: WatchHistoryParams, options?: UseApiQueryOptions) {
  const queryParams: Record<string, string> = {};
  if (params?.page !== undefined) queryParams.page = String(params.page);
  if (params?.pageSize !== undefined) queryParams.pageSize = String(params.pageSize);

  return useApiQuery<HistoryListResponse>('/api/interactions/history', {
    ...options,
    params: { ...queryParams, ...(options?.params ?? {}) },
  });
}

/** GET /api/playlists — the caller's playlist list. */
export function usePlaylists(options?: UseApiQueryOptions) {
  return useApiQuery<PlaylistListResponse>('/api/playlists', options);
}

/** GET /api/playlists/watch-later — the caller's Watch Later queue. */
export function useWatchLater(options?: UseApiQueryOptions) {
  return useApiQuery<WatchLaterListResponse>('/api/playlists/watch-later', options);
}

/**
 * POST /api/playlists — create a playlist; on success invalidate the playlist
 * list query key so it re-fetches (Req 2.13).
 */
export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  return useApiMutation<CreatePlaylistInput, PlaylistData>('/api/playlists', {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
    },
  });
}

/**
 * POST /api/playlists/watch-later — add a video to Watch Later; on success
 * invalidate the watch-later query key (Req 3.11).
 */
export function useAddWatchLater() {
  const queryClient = useQueryClient();
  return useApiMutation<AddWatchLaterInput, WatchLaterItem>('/api/playlists/watch-later', {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/playlists/watch-later'] });
    },
  });
}

/**
 * DELETE /api/playlists/watch-later/:entryId — remove an entry from Watch
 * Later; on success invalidate the watch-later query key (Req 3.11). The
 * per-call path is built from the input via `useApiMutation`'s `path` option.
 */
export function useRemoveWatchLater() {
  const queryClient = useQueryClient();
  return useApiMutation<RemoveWatchLaterInput, void>('/api/playlists/watch-later', {
    method: 'DELETE',
    path: (input) => `/api/playlists/watch-later/${input.entryId}`,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/playlists/watch-later'] });
    },
  });
}
