'use client';

// ============================================================================
// API Client SDK - Infinite Query Hook Factory
// ============================================================================

import { useInfiniteQuery as useReactInfiniteQuery } from '@tanstack/react-query';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import type { APIResponse, PaginatedResponse, QueryOptions } from '../core/types';
import type { HttpClient } from '../core/http-client';

/**
 * Factory function to create typed infinite query hooks for paginated endpoints.
 */
export function createInfiniteQueryHook<TParams extends Record<string, string>, TItem>(
  client: HttpClient,
  endpoint: string | ((params: TParams) => string),
) {
  return function useTypedInfiniteQuery(
    params: TParams,
    queryOptions?: QueryOptions,
  ): UseInfiniteQueryResult<APIResponse<PaginatedResponse<TItem>>> {
    const path = typeof endpoint === 'function' ? endpoint(params) : endpoint;
    const queryKey = [path, 'infinite', params];

    return useReactInfiniteQuery({
      queryKey,
      queryFn: async ({ pageParam }) => {
        const paginatedParams = { ...params, page: String(pageParam) };
        return client.get<PaginatedResponse<TItem>>(path, paginatedParams);
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage) => {
        if (lastPage.data?.hasNext) {
          return lastPage.data.page + 1;
        }
        return undefined;
      },
      enabled: queryOptions?.enabled ?? true,
      staleTime: queryOptions?.staleTime ?? 30000,
      gcTime: queryOptions?.cacheTime ?? 300000,
      refetchOnWindowFocus: queryOptions?.refetchOnWindowFocus ?? false,
    });
  };
}
