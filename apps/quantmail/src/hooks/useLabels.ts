import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useLabels() {
  return useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const response = await apiClient.getLabels();
      if (!response.success) throw new Error(response.error?.message || 'Failed to load labels');
      return response.data ?? [];
    },
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const response = await apiClient.createLabel(name, color);
      if (!response.success) throw new Error(response.error?.message || 'Failed to create label');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
    },
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const response = await apiClient.updateLabel(id, { name, color });
      if (!response.success) throw new Error(response.error?.message || 'Failed to update label');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
    },
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.deleteLabel(id);
      if (!response.success) throw new Error(response.error?.message || 'Failed to delete label');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
    },
  });
}
