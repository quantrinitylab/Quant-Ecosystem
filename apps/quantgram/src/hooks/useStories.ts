import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useStories() {
  return useQuery({
    queryKey: ['neon-stories'],
    queryFn: async () => {
      const response = await apiClient.getStoriesFeed();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load stories');
      }
      return response.data ?? [];
    },
  });
}

export default useStories;
