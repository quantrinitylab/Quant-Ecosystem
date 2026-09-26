import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { getGuestFeaturedPosts } from '../data/public-reels';
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
        // Fall back to guest featured posts on failure
      }
      return getGuestFeaturedPosts() as unknown as Post[];
    },
  });
}

export default useExplore;
