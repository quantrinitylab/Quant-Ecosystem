// ============================================================================
// QuantAds - Analytics Hooks (React Query)
// Analytics data fetching with staleTime and realtime refetch
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quantAdsAPI } from '../services/api-client';

export const analyticsKeys = {
  all: ['analytics'] as const,
  campaign: (id: string) => ['analytics', 'campaign', id] as const,
  realtime: (id: string) => ['analytics', 'realtime', id] as const,
  reports: ['analytics', 'reports'] as const,
};

export function useCampaignAnalytics(id: string) {
  return useQuery({
    queryKey: analyticsKeys.campaign(id),
    queryFn: async () => {
      const response = await quantAdsAPI.getCampaignAnalytics(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load analytics');
      }
      return response.data;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRealtimeStats(id: string) {
  return useQuery({
    queryKey: analyticsKeys.realtime(id),
    queryFn: async () => {
      const response = await quantAdsAPI.getRealtimeStats(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load realtime stats');
      }
      return response.data;
    },
    enabled: !!id,
    refetchInterval: 10000, // 10 seconds
  });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Parameters<typeof quantAdsAPI.generateReport>[0]) => {
      const response = await quantAdsAPI.generateReport(data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to generate report');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analyticsKeys.reports });
    },
  });
}

export default useCampaignAnalytics;
