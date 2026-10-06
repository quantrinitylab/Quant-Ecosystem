import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Profile } from '../types';

// Backend error codes that mean "retrying will not help": the profile cannot
// be loaded for this viewer no matter how many times we ask (not found, or the
// viewer is not authenticated and the path is not public). A guest seeing one
// of these should get an error/empty state immediately — never an infinite
// spinner.
export const NON_RETRIABLE_PROFILE_CODES = new Set([
  'PROFILE_NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
]);

export interface ProfileQueryError extends Error {
  code?: string;
}

/**
 * Returns true when a failed profile fetch is worth retrying: network-level
 * failures (no backend error code) retry, terminal client errors do not.
 */
export function shouldRetryProfileFetch(failureCount: number, error: unknown): boolean {
  const code = (error as ProfileQueryError | undefined)?.code;
  if (code && NON_RETRIABLE_PROFILE_CODES.has(code)) return false;
  return failureCount < 3;
}

export function useProfile(id: string) {
  // Explicit TError so `error` is ProfileQueryError (not `{}`): the retry
  // callback's `error: unknown` param otherwise poisons type inference and
  // `error.message` fails typecheck (TS2339).
  return useQuery<Profile | undefined, ProfileQueryError>({
    queryKey: ['neon-profile', id],
    queryFn: async () => {
      const response = await apiClient.getProfile(id);
      if (!response.success) {
        const error = new Error(
          response.error?.message || 'Failed to load profile',
        ) as ProfileQueryError;
        error.code = response.error?.code;
        throw error;
      }
      return response.data?.profile;
    },
    retry: shouldRetryProfileFetch,
    enabled: !!id,
  });
}

export default useProfile;
