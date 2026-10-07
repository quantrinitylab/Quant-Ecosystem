'use client';

// ============================================================================
// API Client SDK - Query Hook Factory
// ============================================================================

import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { APIResponse, QueryOptions } from '../core/types';
import type { HttpClient } from '../core/http-client';

/** Options for creating a query hook */
export interface CreateQueryHookOptions {
  staleTime?: number;
  cacheTime?: number;
}

/**
 * Factory function to create typed React Query hooks for GET endpoints.
 */
export function createQueryHook<TParams extends Record<string, string>, TResponse>(
  client: HttpClient,
  endpoint: string | ((params: TParams) => string),
  options?: CreateQueryHookOptions,
) {
  return function useTypedQuery(
    params: TParams,
    queryOptions?: QueryOptions,
  ): UseQueryResult<APIResponse<TResponse>> {
    const path = typeof endpoint === 'function' ? endpoint(params) : endpoint;
    const queryKey = [path, params];

    return useReactQuery({
      queryKey,
      queryFn: async () => client.get<TResponse>(path, params),
      enabled: queryOptions?.enabled ?? true,
      staleTime: queryOptions?.staleTime ?? options?.staleTime ?? 30000,
      gcTime: queryOptions?.cacheTime ?? options?.cacheTime ?? 300000,
      refetchOnWindowFocus: queryOptions?.refetchOnWindowFocus ?? false,
      retry: queryOptions?.retry ?? 3,
    });
  };
}
