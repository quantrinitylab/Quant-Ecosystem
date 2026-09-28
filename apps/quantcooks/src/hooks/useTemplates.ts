import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useTemplates(category?: string, search?: string) {
  return useQuery({
    queryKey: ['templates', category, search],
    queryFn: async () => {
      const response = await apiClient.listTemplates(category, search);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load templates');
      }
      return response.data ?? [];
    },
  });
}

export default useTemplates;
