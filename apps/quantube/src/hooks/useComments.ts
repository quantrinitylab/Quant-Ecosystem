import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useComments(contentId: string) {
  return useQuery({
    queryKey: ['comments', contentId],
    queryFn: async () => {
      const response = await apiClient.getComments(contentId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load comments');
      }
      const data = response.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray((data as any).comments)) return (data as any).comments;
      return [];
    },
    enabled: !!contentId,
  });
}

export default useComments;
