import { useQuery } from '@tanstack/react-query';
import { apiClient, type ServerProjectType } from '../services/api-client';

export function useProjects(type?: ServerProjectType, page?: number) {
  return useQuery({
    queryKey: ['projects', type, page],
    queryFn: async () => {
      const response = await apiClient.listProjects(type, page);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load projects');
      }
      // listProjects returns the backend's paginated envelope; consumers of
      // this hook want the page's items (P0-2 contract reconciliation).
      return response.data?.data ?? [];
    },
  });
}

export default useProjects;
