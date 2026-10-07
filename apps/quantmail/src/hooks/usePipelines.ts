import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useWorkflows(repoId?: string) {
  return useQuery({
    queryKey: ['workflows', repoId],
    queryFn: async () => {
      const response = await apiClient.getWorkflows(repoId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load workflows');
      return response.data ?? [];
    },
  });
}

export function useBuilds(options?: { repoId?: string; status?: string; page?: number }) {
  return useQuery({
    queryKey: ['builds', options],
    queryFn: async () => {
      const response = await apiClient.getBuilds(options);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load builds');
      return response.data ?? [];
    },
  });
}

export function useDeployments(repoId?: string, environment?: string) {
  return useQuery({
    queryKey: ['deployments', repoId, environment],
    queryFn: async () => {
      const response = await apiClient.getDeployments(repoId, environment);
      if (!response.success)
        throw new Error(response.error?.message || 'Failed to load deployments');
      return response.data ?? [];
    },
  });
}

export function useTriggerWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, branch }: { id: string; branch?: string }) => {
      const response = await apiClient.triggerWorkflow(id, branch);
      if (!response.success)
        throw new Error(response.error?.message || 'Failed to trigger workflow');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['builds'] });
    },
  });
}

export function useCancelBuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.cancelBuild(id);
      if (!response.success) throw new Error(response.error?.message || 'Failed to cancel build');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['builds'] });
    },
  });
}
