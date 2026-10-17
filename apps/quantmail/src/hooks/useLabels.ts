import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { EMAIL_LIST_PREFIXES } from '../lib/offline/folders';

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

/**
 * Apply a label to one email — the mutation behind the inbox row's label
 * picker. On success the label list and every cached mailbox list are
 * invalidated so the row's `currentLabels` (derived from the email cache)
 * and the labels page stay truthful without a manual refetch.
 */
export function useApplyLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ emailId, labelId }: { emailId: string; labelId: string }) => {
      const response = await apiClient.applyLabel(emailId, labelId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to apply label');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      for (const prefix of EMAIL_LIST_PREFIXES) {
        queryClient.invalidateQueries({ queryKey: prefix });
      }
    },
  });
}

/**
 * Remove a label from one email — the counterpart of `useApplyLabel`, also
 * behind the row's label picker. Without this the picker would be a one-way
 * door (apply only), which is why the row stayed unwired until now.
 */
export function useRemoveLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ emailId, labelId }: { emailId: string; labelId: string }) => {
      const response = await apiClient.removeLabel(emailId, labelId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to remove label');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      for (const prefix of EMAIL_LIST_PREFIXES) {
        queryClient.invalidateQueries({ queryKey: prefix });
      }
    },
  });
}
