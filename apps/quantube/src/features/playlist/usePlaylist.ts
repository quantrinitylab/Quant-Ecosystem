// ============================================================================
// quantube — playlist-detail api-client hook (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from the `playlist/[id]` detail page to the
// backend: a typed react-query read over the same-origin Next proxy path
// `/api/playlists/{id}` — never an inline fetch (Req 8.7). Mirrors
// `features/library/useLibrary.ts` / `features/creator/useCreator.ts`: wraps
// `useApiQuery` and is typed against the page-local `PlaylistDetailResponse`
// contract imported from `pages/playlist/[id].tsx` (the single authoritative
// source — Req 8.5, 8.8).
import { useApiQuery } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type { PlaylistDetailResponse } from '../../pages/playlist/[id]';

/**
 * GET /api/playlists/{id} — the playlist header + ordered videos (Req 2.2).
 * The query is gated on `id`: when `id` is absent (empty/undefined) the query
 * stays disabled, mirroring how detail hooks avoid firing without a key.
 */
export function usePlaylist(id: string, options?: UseApiQueryOptions) {
  return useApiQuery<PlaylistDetailResponse>(`/api/playlists/${id}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(id),
  });
}
