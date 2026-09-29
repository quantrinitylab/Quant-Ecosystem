import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Post } from '../types';

export function useUserPosts(userId: string) {
  return useQuery({
    queryKey: ['neon-user-posts', userId],
    queryFn: async (): Promise<Post[]> => {
      const response = await apiClient.getUserPosts(userId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load posts');
      }
      return response.data?.posts ?? [];
    },
    enabled: !!userId,
  });
}

export default useUserPosts;
