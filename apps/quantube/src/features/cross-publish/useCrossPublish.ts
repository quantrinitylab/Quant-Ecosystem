// ============================================================================
// quantube — cross-publish api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantube UI surface to the cross-publish
// engine: typed react-query hooks over the same-origin Next proxy paths under
// `/api/cross-publish/*` (never inline fetch — Requirement 1.4). The proxy
// forwards the bearer + x-request-id to the backend (Layer 4), which reaches the
// decorated `@quant/cross-publish` engine (Layer 2/3, wired AS-IS per Req 9.1).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  CreateIntentInput,
  CreateIntentResponse,
  FanoutResponse,
  IntentStatusResponse,
  LibraryListResponse,
  ListIntentsResponse,
  StoreContentInput,
  StoreContentResponse,
} from './types';

/** GET /api/cross-publish/intents — list the caller's publish intents. */
export function usePublishIntents(options?: UseApiQueryOptions) {
  return useApiQuery<ListIntentsResponse>('/api/cross-publish/intents', options);
}

/** POST /api/cross-publish/intents — create a publish intent. */
export function useCreatePublishIntent() {
  return useApiMutation<CreateIntentInput, CreateIntentResponse>('/api/cross-publish/intents');
}

/** POST /api/cross-publish/intents/:id/fanout — fan an intent across surfaces. */
export function useFanoutIntent() {
  return useApiMutation<{ id: string }, FanoutResponse>('/api/cross-publish/intents', {
    path: (input) => `/api/cross-publish/intents/${encodeURIComponent(input.id)}/fanout`,
  });
}

/** GET /api/cross-publish/intents/:id/status — fanout status for an intent. */
export function useIntentStatus(intentId: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<IntentStatusResponse>(`/api/cross-publish/intents/${intentId ?? ''}/status`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(intentId),
  });
}

/** GET /api/cross-publish/library — list the caller's stored content. */
export function useContentLibrary(options?: UseApiQueryOptions) {
  return useApiQuery<LibraryListResponse>('/api/cross-publish/library', options);
}

/** POST /api/cross-publish/library — store a reusable content item. */
export function useStoreContent() {
  return useApiMutation<StoreContentInput, StoreContentResponse>('/api/cross-publish/library');
}
