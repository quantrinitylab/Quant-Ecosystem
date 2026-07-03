import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { MeView } from '../types';

/**
 * The authenticated user's real, backend-verified profile (id, username,
 * displayName, avatar, xp/level) resolved from `/auth/me` via the userinfo
 * proxy. Fail-closed: any non-success response throws, so callers never render
 * a fabricated identity. Used by the profile hub to replace the former
 * hardcoded `CURRENT_USER_ID = 'me'` / `CURRENT_USER_XP = 2450` placeholders.
 */
export function useMe() {
  const query = useQuery<MeView, Error>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await apiClient.getMe();
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Failed to load profile');
      }
      return res.data;
    },
  });

  return {
    me: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useMe;
