'use client';

// ============================================================================
// @quant/api-client - useApiQuery (same-origin proxy query hook)
// ============================================================================
//
// Canonical Layer-5 read hook from the integration seam (design.md). A UI
// surface consumes an engine-backed endpoint by calling this hook with the
// same-origin Next.js proxy path — never an inline `fetch`. Example:
//
//   const { data } = useApiQuery<Conversation[]>('/api/assistant/conversations');

import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { APIResponse, QueryOptions } from '../core/types';
import { apiFetch } from '../core/api-fetch';

/** Options for `useApiQuery` (react-query options + request shaping). */
export interface UseApiQueryOptions extends QueryOptions {
  /** Query-string params appended to the proxy path. */
  params?: Record<string, string>;
  /** Extra headers to send with the request. */
  headers?: Record<string, string>;
  /** Bearer token (optional; same-origin cookies also authenticate the proxy). */
  token?: string;
}

/**
 * Typed, cache-aware GET against a same-origin Next.js proxy path.
 * Returns the standard `APIResponse<TResponse>` envelope via react-query.
 */
export function useApiQuery<TResponse>(
  path: string,
  options?: UseApiQueryOptions,
): UseQueryResult<APIResponse<TResponse>> {
  const { params, headers, token, ...queryOptions } = options ?? {};

  return useReactQuery({
    queryKey: [path, params ?? {}],
    queryFn: ({ signal }) =>
      apiFetch<TResponse>(path, { method: 'GET', params, headers, token, signal }),
    enabled: queryOptions.enabled ?? true,
    staleTime: queryOptions.staleTime ?? 30000,
    gcTime: queryOptions.cacheTime ?? 300000,
    refetchOnWindowFocus: queryOptions.refetchOnWindowFocus ?? false,
    retry: queryOptions.retry ?? 3,
  });
}
