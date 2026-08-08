import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useInbox(options?: {
  label?: string;
  category?: string;
  folderType?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['inbox', options?.label, options?.category, options?.folderType, options?.page],
    queryFn: async () => {
      const response = await apiClient.getEmails(options);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load inbox');
      }
      return response.data ?? [];
    },
    // Live updates: refetch every 30 seconds when window is focused
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    // Refetch when user tabs back into QuantMail
    refetchOnWindowFocus: true,
    // Keep showing stale data while refetching
    staleTime: 15_000,
  });
}

export default useInbox;
