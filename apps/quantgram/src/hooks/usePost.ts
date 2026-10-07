import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function usePost(id: string) {
  return useQuery({
    queryKey: ['neon-post', id],
    queryFn: async () => {
      const response = await apiClient.getPost(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load post');
      }
      return response.data?.post;
    },
    enabled: !!id,
  });
}

export default usePost;
