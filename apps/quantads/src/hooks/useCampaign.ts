// ============================================================================
// QuantAds - Campaign Hooks (React Query)
// Campaign CRUD operations with cache invalidation
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quantAdsAPI } from '../services/api-client';

export const campaignKeys = {
  all: ['campaigns'] as const,
  list: (status?: string) => ['campaigns', 'list', status] as const,
  detail: (id: string) => ['campaigns', 'detail', id] as const,
};

export function useCampaigns(status?: string) {
  return useQuery({
    queryKey: campaignKeys.list(status),
    queryFn: async () => {
      const response = await quantAdsAPI.listCampaigns(status);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load campaigns');
      }
      return response.data || [];
    },
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: async () => {
      const response = await quantAdsAPI.getCampaign(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Campaign not found');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Parameters<typeof quantAdsAPI.createCampaign>[0]) => {
      const response = await quantAdsAPI.createCampaign(data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create campaign');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof quantAdsAPI.updateCampaign>[1];
    }) => {
      const response = await quantAdsAPI.updateCampaign(id, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update campaign');
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(variables.id) });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quantAdsAPI.deleteCampaign(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete campaign');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quantAdsAPI.updateCampaignStatus(id, 'paused');
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to pause campaign');
      }
      return response.data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(id) });
    },
  });
}

export function useResumeCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await quantAdsAPI.updateCampaignStatus(id, 'active');
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to resume campaign');
      }
      return response.data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(id) });
    },
  });
}

export default useCampaigns;
