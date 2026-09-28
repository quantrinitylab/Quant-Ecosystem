import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useAssets(category?: string, search?: string) {
  return useQuery({
    queryKey: ['assets', category, search],
    queryFn: async () => {
      const response = await apiClient.listAssets(category, search);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load assets');
      }
      return response.data ?? [];
    },
  });
}

export default useAssets;
