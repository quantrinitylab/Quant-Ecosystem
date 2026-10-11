import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Post } from '../types';

export function useExplore() {
  return useQuery({
    queryKey: ['neon-explore'],
    queryFn: async (): Promise<Post[]> => {
      try {
        const response = await apiClient.getExploreFeed();
        if (response.success && response.data?.posts && response.data.posts.length > 0) {
          return response.data.posts;
        }
      } catch {
        // No fake fallback: an empty feed is honest, invented posts are not.
      }
      return [];
    },
  });
}

export default useExplore;
