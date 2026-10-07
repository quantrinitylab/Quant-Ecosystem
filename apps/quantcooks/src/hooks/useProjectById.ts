import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useProjectById(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await apiClient.getProject(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load project');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export default useProjectById;
