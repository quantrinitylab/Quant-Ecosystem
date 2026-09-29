import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useARFilters() {
  return useQuery({
    queryKey: ['neon-ar-filters'],
    queryFn: async () => {
      const response = await apiClient.getARFilters();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load AR filters');
      }
      return response.data?.filters ?? [];
    },
  });
}

export default useARFilters;
