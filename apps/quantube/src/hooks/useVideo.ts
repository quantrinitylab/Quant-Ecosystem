import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useVideo(id: string) {
  return useQuery({
    queryKey: ['video', id],
    queryFn: async () => {
      const response = await apiClient.getVideo(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load video');
      }
      return (response.data as any)?.video ?? response.data;
    },
    enabled: !!id,
  });
}

export default useVideo;
