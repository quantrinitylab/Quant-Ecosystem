// ============================================================================
// QuantEdits - useBrandKit Hook
// Brand kit state: load kits, apply brand, check consistency
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

interface BrandKit {
  id: string;
  name: string;
  isDefault: boolean;
  colors: { primary: string; secondary: string; accent: string; background: string; text: string };
  fonts: { heading: string; body: string; accent: string };
  logos: { id: string; url: string; variant: string }[];
}

interface ConsistencyIssue {
  element: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
}

export function useBrandKit() {
  const queryClient = useQueryClient();

  const kitsQuery = useQuery({
    queryKey: ['brand-kits'],
    queryFn: async () => {
      const response = await apiClient.listBrandKits();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load brand kits');
      }
      return (response.data ?? []) as BrandKit[];
    },
  });

  const createKitMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiClient.createBrandKit({ name });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create brand kit');
      }
      return response.data as BrandKit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
    },
  });

  const deleteKitMutation = useMutation({
    mutationFn: async (kitId: string) => {
      const response = await apiClient.deleteBrandKit(kitId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete brand kit');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ kitId, elements }: { kitId: string; elements: unknown[] }) => {
      const response = await apiClient.applyBrandKit(kitId, elements);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to apply brand kit');
      }
      return response.data as { applied: number; skipped: number };
    },
  });

  const consistencyMutation = useMutation({
    mutationFn: async ({ kitId, elements }: { kitId: string; elements: unknown[] }) => {
      const response = await apiClient.checkBrandConsistency(kitId, elements);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to check consistency');
      }
      return (response.data ?? []) as ConsistencyIssue[];
    },
  });

  return {
    kits: kitsQuery.data ?? [],
    isLoading: kitsQuery.isLoading,
    error: kitsQuery.error,
    refetch: kitsQuery.refetch,
    createKit: createKitMutation.mutateAsync,
    deleteKit: deleteKitMutation.mutateAsync,
    applyToProject: applyMutation.mutateAsync,
    checkConsistency: consistencyMutation.mutateAsync,
  };
}

export default useBrandKit;
