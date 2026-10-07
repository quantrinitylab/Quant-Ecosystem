import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useTrending() {
  return useQuery({
    queryKey: ['trending'],
    queryFn: async () => {
      const response = await apiClient.getTrending();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load trending videos');
      }
      return response.data?.videos ?? [];
    },
  });
}

export default useTrending;
