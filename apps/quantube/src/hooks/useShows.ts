import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useShows(genre?: string) {
  return useQuery({
    queryKey: ['shows', genre],
    queryFn: async () => {
      const response = await apiClient.getShows(genre ? { genre } : undefined);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load shows');
      }
      return response.data?.shows ?? [];
    },
  });
}

export function useShow(id: string) {
  return useQuery({
    queryKey: ['show', id],
    queryFn: async () => {
      const response = await apiClient.getShow(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load show');
      }
      return response.data?.show ?? null;
    },
    enabled: !!id,
  });
}

export default useShows;
