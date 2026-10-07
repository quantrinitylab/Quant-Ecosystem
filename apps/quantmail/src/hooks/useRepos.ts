import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useRepos(options?: { visibility?: string; sort?: string; page?: number }) {
  return useQuery({
    queryKey: ['repos', options],
    queryFn: async () => {
      const response = await apiClient.getRepos(options);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load repos');
      return response.data ?? [];
    },
  });
}

export function useRepo(id: string) {
  return useQuery({
    queryKey: ['repo', id],
    queryFn: async () => {
      const response = await apiClient.getRepo(id);
      if (!response.success)
        throw new Error(response.error?.message || 'Failed to load repository');
      return response.data!;
    },
    enabled: !!id,
  });
}

export function useBranches(repoId: string) {
  return useQuery({
    queryKey: ['branches', repoId],
    queryFn: async () => {
      const response = await apiClient.getBranches(repoId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load branches');
      return response.data ?? [];
    },
    enabled: !!repoId,
  });
}

export function useCommits(repoId: string, branch?: string) {
  return useQuery({
    queryKey: ['commits', repoId, branch],
    queryFn: async () => {
      const response = await apiClient.getCommits(repoId, branch);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load commits');
      return response.data ?? [];
    },
    enabled: !!repoId,
  });
}

export function usePullRequests(repoId: string, status?: string) {
  return useQuery({
    queryKey: ['pull-requests', repoId, status],
    queryFn: async () => {
      const response = await apiClient.getPullRequests(repoId, status);
      if (!response.success)
        throw new Error(response.error?.message || 'Failed to load pull requests');
      return response.data ?? [];
    },
    enabled: !!repoId,
  });
}

export function useIssues(repoId: string, status?: string) {
  return useQuery({
    queryKey: ['issues', repoId, status],
    queryFn: async () => {
      const response = await apiClient.getIssues(repoId, status);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load issues');
      return response.data ?? [];
    },
    enabled: !!repoId,
  });
}

export function useFileTree(repoId: string) {
  return useQuery({
    queryKey: ['file-tree', repoId],
    queryFn: async () => {
      const response = await apiClient.getFileTree(repoId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load file tree');
      return response.data ?? [];
    },
    enabled: !!repoId,
  });
}

export function useFileContent(repoId: string, path: string | null) {
  return useQuery({
    queryKey: ['file-content', repoId, path],
    queryFn: async () => {
      const response = await apiClient.getFileContent(repoId, path as string);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load file');
      return response.data!;
    },
    enabled: !!repoId && !!path,
  });
}

export function useCreateRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description: string;
      visibility: string;
      initReadme?: boolean;
    }) => {
      const response = await apiClient.createRepo(data);
      if (!response.success)
        throw new Error(response.error?.message || 'Failed to create repository');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });
}
