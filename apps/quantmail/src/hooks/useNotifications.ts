'use client';

// ============================================================================
// QuantMail — Notifications center hooks (K10 / M15).
//
// Real backend only: GET /api/notifications, PATCH /api/notifications/:id/read,
// POST /api/notifications/read-all, DELETE /api/notifications/:id.
// There is no seed data anywhere in this file — an empty backend means an
// honest empty state, not fabricated rows.
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { browserApiRequest } from '../services/browser-api-request';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  imageUrl?: string | null;
  actionUrl: string | null;
  sourceApp?: string | null;
  priority: NotificationPriority;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

interface NotificationsPayload {
  success: boolean;
  data?: { notifications: AppNotification[]; unreadCount: number };
  error?: { message?: string };
}

async function readJson(response: Response): Promise<NotificationsPayload | null> {
  try {
    return (await response.json()) as NotificationsPayload;
  } catch {
    return null;
  }
}

async function fetchNotifications(limit = 50): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  const response = await browserApiRequest(`/api/notifications?limit=${limit}`);
  const payload = await readJson(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Could not load notifications.');
  }
  return payload.data;
}

export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: ['notifications', limit],
    queryFn: () => fetchNotifications(limit),
    // The bell polls on its own cadence; the center is a manual-refresh screen
    // so a mark-read/delete never fights a background refetch.
    staleTime: 60 * 1000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await browserApiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Could not mark the notification as read.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await browserApiRequest('/api/notifications/read-all', { method: 'POST' });
      if (!response.ok) throw new Error('Could not mark notifications as read.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await browserApiRequest(
        `/api/notifications/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Could not delete the notification.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
