import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useProjects(type?: string, page?: number) {
  return useQuery({
    queryKey: ['projects', type, page],
    queryFn: async () => {
      const response = await apiClient.listProjects(type, page);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load projects');
      }
      return response.data ?? [];
    },
  });
}

export default useProjects;
