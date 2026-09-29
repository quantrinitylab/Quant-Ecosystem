import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export interface CloseFriend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export function useCloseFriends() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['neon-close-friends'],
    queryFn: async (): Promise<CloseFriend[]> => {
      const response = await apiClient.listCloseFriends();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load close friends');
      }
      return response.data?.friends ?? [];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, add }: { id: string; add: boolean }) => {
      const response = await apiClient.toggleCloseFriend(id, add);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update close friend');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neon-close-friends'] });
    },
  });

  return {
    closeFriends: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    toggleCloseFriend: (id: string, add: boolean) => toggle.mutateAsync({ id, add }),
  };
}

export default useCloseFriends;
