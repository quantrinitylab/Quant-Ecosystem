'use client';

// ============================================================================
// API Client SDK - Mutation Hook Factory
// ============================================================================

import { useMutation as useReactMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { APIResponse } from '../core/types';
import type { HttpClient } from '../core/http-client';

/** Options for creating a mutation hook */
export interface CreateMutationHookOptions {
  method?: 'POST' | 'PUT' | 'DELETE';
  onSuccess?: () => void;
}

/**
 * Factory function to create typed React Query mutation hooks.
 * Supports optimistic updates via the options pattern.
 */
export function createMutationHook<TParams, TResponse>(
  client: HttpClient,
  endpoint: string | ((params: TParams) => string),
  options?: CreateMutationHookOptions,
) {
  return function useTypedMutation(): UseMutationResult<APIResponse<TResponse>, Error, TParams> {
    return useReactMutation({
      mutationFn: async (params: TParams) => {
        const path = typeof endpoint === 'function' ? endpoint(params) : endpoint;
        const method = options?.method || 'POST';

        switch (method) {
          case 'PUT':
            return client.put<TResponse>(path, params);
          case 'DELETE':
            return client.delete<TResponse>(path);
          default:
            return client.post<TResponse>(path, params);
        }
      },
      onSuccess: options?.onSuccess,
    });
  };
}
