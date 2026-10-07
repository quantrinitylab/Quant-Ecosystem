// ============================================================================
// quantai — browser-agent api-client hooks (Layer 5)
// ============================================================================
//
// Typed react-query hooks over the same-origin Next proxy paths under
// `/api/agents/browser/*` (never inline fetch — Requirement 1.4).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  BrowserSession,
  BrowserSessionsResponse,
  CreateBrowserSessionInput,
  EndBrowserSessionResponse,
} from './types';

/** POST /api/agents/browser/sessions — open a browsing session for the caller. */
export function useCreateBrowserSession() {
  return useApiMutation<CreateBrowserSessionInput, BrowserSession>('/api/agents/browser/sessions');
}

/** GET /api/agents/browser/sessions — list the caller's active sessions. */
export function useBrowserSessions(options?: UseApiQueryOptions) {
  return useApiQuery<BrowserSessionsResponse>('/api/agents/browser/sessions', options);
}

/** GET /api/agents/browser/sessions/:id — fetch one of the caller's sessions. */
export function useBrowserSession(id: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<BrowserSession>(`/api/agents/browser/sessions/${id ?? ''}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(id),
  });
}

/**
 * POST /api/agents/browser/sessions/:id/end — close one of the caller's
 * sessions. The mutation variable is the session id (used to build the path).
 */
export function useEndBrowserSession() {
  return useApiMutation<string, EndBrowserSessionResponse>('/api/agents/browser/sessions', {
    path: (id) => `/api/agents/browser/sessions/${id}/end`,
  });
}
