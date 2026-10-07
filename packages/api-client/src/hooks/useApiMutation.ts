'use client';

// ============================================================================
// @quant/api-client - useApiMutation (same-origin proxy mutation hook)
// ============================================================================
//
// Canonical Layer-5 write hook from the integration seam (design.md). A UI
// surface mutates an engine-backed endpoint by calling this hook with the
// same-origin Next.js proxy path — never an inline `fetch`. Example:
//
//   const send = useApiMutation<SendInput, SendResult>('/api/notifications/send');
//   send.mutate({ to, body });

import { useMutation as useReactMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { APIResponse } from '../core/types';
import { apiFetch, type ApiMethod } from '../core/api-fetch';

/** Options for `useApiMutation`. */
export interface UseApiMutationOptions<TInput, TResponse> {
  /** HTTP verb for the mutation (default `POST`). */
  method?: Exclude<ApiMethod, 'GET'>;
  /** Extra headers to send with the request. */
  headers?: Record<string, string>;
  /** Bearer token (optional; same-origin cookies also authenticate the proxy). */
  token?: string;
  /** Build a dynamic path from the variables (overrides the static path). */
  path?: (input: TInput) => string;
  onSuccess?: (data: APIResponse<TResponse>, input: TInput) => void;
  onError?: (error: Error, input: TInput) => void;
}

/**
 * Typed mutation against a same-origin Next.js proxy path.
 * Returns the standard `APIResponse<TResponse>` envelope via react-query.
 */
export function useApiMutation<TInput = unknown, TResponse = unknown>(
  path: string,
  options?: UseApiMutationOptions<TInput, TResponse>,
): UseMutationResult<APIResponse<TResponse>, Error, TInput> {
  const method = options?.method ?? 'POST';

  return useReactMutation<APIResponse<TResponse>, Error, TInput>({
    mutationFn: (input: TInput) => {
      const targetPath = options?.path ? options.path(input) : path;
      return apiFetch<TResponse>(targetPath, {
        method,
        body: input,
        headers: options?.headers,
        token: options?.token,
      });
    },
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}
