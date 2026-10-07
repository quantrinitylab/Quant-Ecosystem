// ============================================================================
// quantube — music api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from the QuantTube Music UI surface to the
// backend: typed calls over the same-origin Next proxy paths
// (`/api/music`, `/api/music/tracks`, `/api/music/albums`,
// `/api/music/albums/:id`, `/api/music/tracks/:id/stream`) — never an inline
// fetch in the page. The proxy forwards to the backend (Layer 4), which
// reaches MusicService (Prisma-backed: MusicAlbum + MusicTrack).
//
// The page-local interfaces in `pages/music.tsx` are the single authoritative
// response contracts (mirrors features/library/useLibrary.ts); they are
// imported here, never redefined.
import { useApiQuery, apiFetch } from '@quant/api-client';
import type { UseApiQueryOptions, APIResponse } from '@quant/api-client';
import type {
  MusicHomeResponse,
  MusicTracksResponse,
  MusicAlbumsResponse,
  MusicAlbumDetailResponse,
  TrackStreamResponse,
} from '../../pages/music';

/** Query-string params accepted by the track list read. */
export interface MusicTracksParams {
  page?: number;
  pageSize?: number;
  genre?: string;
  albumId?: string;
}

/** Query-string params accepted by the album list read. */
export interface MusicAlbumsParams {
  page?: number;
  pageSize?: number;
}

/** GET /api/music — overview: recent tracks + recent albums. */
export function useMusicHome(options?: UseApiQueryOptions) {
  return useApiQuery<MusicHomeResponse>('/api/music', options);
}

/** GET /api/music/tracks — paginated, filterable track list. */
export function useMusicTracks(params?: MusicTracksParams, options?: UseApiQueryOptions) {
  const queryParams: Record<string, string> = {};
  if (params?.page !== undefined) queryParams.page = String(params.page);
  if (params?.pageSize !== undefined) queryParams.pageSize = String(params.pageSize);
  if (params?.genre) queryParams.genre = params.genre;
  if (params?.albumId) queryParams.albumId = params.albumId;
  return useApiQuery<MusicTracksResponse>('/api/music/tracks', {
    ...options,
    params: { ...queryParams, ...(options?.params ?? {}) },
  });
}

/** GET /api/music/albums — paginated album list. */
export function useMusicAlbums(params?: MusicAlbumsParams, options?: UseApiQueryOptions) {
  const queryParams: Record<string, string> = {};
  if (params?.page !== undefined) queryParams.page = String(params.page);
  if (params?.pageSize !== undefined) queryParams.pageSize = String(params.pageSize);
  return useApiQuery<MusicAlbumsResponse>('/api/music/albums', {
    ...options,
    params: { ...queryParams, ...(options?.params ?? {}) },
  });
}

/**
 * GET /api/music/albums/:id — one album with its tracks. Fetched on demand
 * when the user opens an album, so it is a plain typed call through the
 * sanctioned apiFetch core rather than a mounted query.
 */
export async function getMusicAlbum(
  albumId: string,
): Promise<APIResponse<MusicAlbumDetailResponse>> {
  return apiFetch<MusicAlbumDetailResponse>(`/api/music/albums/${encodeURIComponent(albumId)}`);
}

/**
 * GET /api/music/tracks/:id/stream — stream info for one track (the backend
 * also counts a play). Fetched on demand when the user presses play, so it is
 * a plain typed call through the sanctioned apiFetch core rather than a
 * mounted query — the page never inlines fetch.
 */
export async function getTrackStream(trackId: string): Promise<APIResponse<TrackStreamResponse>> {
  return apiFetch<TrackStreamResponse>(`/api/music/tracks/${encodeURIComponent(trackId)}/stream`);
}
