// ============================================================================
// quantube — media api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantube UI surface to the media engine:
// typed react-query hooks over the same-origin Next proxy paths under
// `/api/media/*` (never inline fetch — Requirement 1.4). The proxy forwards the
// bearer + x-request-id to the backend (Layer 4), which reaches the decorated
// `@quant/media` engine (Layer 2/3, wired AS-IS per Req 9.1).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  AddMediaInput,
  AddMediaResponse,
  InitUploadInput,
  MediaLibraryQuery,
  MediaLibraryResponse,
  UploadProgressResponse,
  UploadSessionResponse,
} from './types';

/** GET /api/media/library — recent cross-app media items + storage usage. */
export function useMediaLibrary(query?: MediaLibraryQuery, options?: UseApiQueryOptions) {
  return useApiQuery<MediaLibraryResponse>('/api/media/library', {
    ...options,
    params: query
      ? {
          ...(query.type ? { type: query.type } : {}),
          ...(query.maxItems ? { maxItems: String(query.maxItems) } : {}),
          ...(query.sourceApp ? { sourceApp: query.sourceApp } : {}),
        }
      : undefined,
  });
}

/** GET /api/media/uploads/:id — progress for a chunked upload session. */
export function useUploadProgress(sessionId: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<UploadProgressResponse>(`/api/media/uploads/${sessionId ?? ''}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(sessionId),
  });
}

/** POST /api/media/uploads — initialize a resumable chunked upload session. */
export function useInitUpload() {
  return useApiMutation<InitUploadInput, UploadSessionResponse>('/api/media/uploads');
}

/** POST /api/media/uploads/:id/complete — assemble + finalize an upload. */
export function useCompleteUpload() {
  return useApiMutation<{ id: string }, UploadSessionResponse>('/api/media/uploads', {
    path: (input) => `/api/media/uploads/${encodeURIComponent(input.id)}/complete`,
  });
}

/** POST /api/media/library — register a media item in the shared picker. */
export function useAddMedia() {
  return useApiMutation<AddMediaInput, AddMediaResponse>('/api/media/library');
}
