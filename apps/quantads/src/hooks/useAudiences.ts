// ============================================================================
// QuantAds - Audience Hooks (React Query)
// Audience CRUD operations with cache invalidation
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quantAdsAPI } from '../services/api-client';

export const audienceKeys = {
  all: ['audiences'] as const,
  list: ['audiences', 'list'] as const,
  interests: ['audiences', 'interests'] as const,
  behaviors: ['audiences', 'behaviors'] as const,
};

export function useAudiences() {
  return useQuery({
    queryKey: audienceKeys.list,
    queryFn: async () => {
      const response = await quantAdsAPI.listAudiences();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load audiences');
      }
      return response.data || [];
    },
  });
}

export function useCreateAudience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Parameters<typeof quantAdsAPI.createAudience>[0]) => {
      const response = await quantAdsAPI.createAudience(data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create audience');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: audienceKeys.all });
    },
  });
}

export function useEstimateAudience() {
  return useMutation({
    mutationFn: async (targeting: Parameters<typeof quantAdsAPI.estimateAudience>[0]) => {
      const response = await quantAdsAPI.estimateAudience(targeting);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to estimate audience');
      }
      return response.data;
    },
  });
}

export function useInterests() {
  return useQuery({
    queryKey: audienceKeys.interests,
    queryFn: async () => {
      const response = await quantAdsAPI.getInterests();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load interests');
      }
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useBehaviors() {
  return useQuery({
    queryKey: audienceKeys.behaviors,
    queryFn: async () => {
      const response = await quantAdsAPI.getBehaviors();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load behaviors');
      }
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export default useAudiences;
