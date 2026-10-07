import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export interface NotificationItem {
  id: string;
  type: string;
  fromUser: string;
  fromAvatar: string | null;
  title: string;
  content: string;
  read: boolean;
  sourceEntityId: string | null;
  createdAt: string;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['neon-notifications'],
    queryFn: async (): Promise<NotificationItem[]> => {
      const response = await apiClient.getNotifications();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load notifications');
      }
      return response.data?.notifications ?? [];
    },
  });

  const unreadQuery = useQuery({
    queryKey: ['neon-notifications-unread'],
    queryFn: async (): Promise<number> => {
      const response = await apiClient.getUnreadCount();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load unread count');
      }
      return response.data?.count ?? 0;
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const response = await apiClient.markAllRead();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to mark all read');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neon-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['neon-notifications-unread'] });
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.markNotificationRead(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to mark read');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neon-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['neon-notifications-unread'] });
    },
  });

  return {
    notifications: query.data ?? [],
    unreadCount: unreadQuery.data ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    markAllRead: () => markAllRead.mutate(),
    markRead: (id: string) => markRead.mutate(id),
  };
}

export default useNotifications;
