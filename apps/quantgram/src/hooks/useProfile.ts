import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useProfile(id: string) {
  return useQuery({
    queryKey: ['neon-profile', id],
    queryFn: async () => {
      const response = await apiClient.getProfile(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load profile');
      }
      return response.data?.profile;
    },
    enabled: !!id,
  });
}

export default useProfile;
