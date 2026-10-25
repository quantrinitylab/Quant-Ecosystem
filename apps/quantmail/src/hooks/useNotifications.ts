'use client';

// ============================================================================
// QuantMail — Notifications center hooks (K10 / M15).
//
// Real backend only: GET /api/notifications, PATCH /api/notifications/:id/read,
// POST /api/notifications/read-all, DELETE /api/notifications/:id,
// DELETE /api/notifications (clear all).
// There is no seed data anywhere in this file — an empty backend means an
// honest empty state, not fabricated rows.
// ============================================================================

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export interface NotificationsPageData {
  notifications: AppNotification[];
  unreadCount: number;
  /** Total active rows for the caller (all pages), when the backend reports it. */
  totalCount?: number;
  hasMore: boolean;
  nextCursor: string | null;
}

interface NotificationsPayload {
  success: boolean;
  data?: {
    notifications: AppNotification[];
    unreadCount: number;
    totalCount?: number;
    hasMore?: boolean;
    nextCursor?: string | null;
  };
  error?: { message?: string };
}

async function readJson(response: Response): Promise<NotificationsPayload | null> {
  try {
    return (await response.json()) as NotificationsPayload;
  } catch {
    return null;
  }
}

async function fetchNotificationsPage(
  limit: number,
  cursor?: string | null,
): Promise<NotificationsPageData> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const response = await browserApiRequest(`/api/notifications?${params.toString()}`);
  const payload = await readJson(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error?.message || 'Could not load notifications.');
  }
  const data = payload.data;
  return {
    notifications: data.notifications,
    unreadCount: data.unreadCount,
    totalCount: data.totalCount,
    // Older backends predate paging fields: a page without `hasMore` is a
    // final page, never an invitation to fetch forever.
    hasMore: data.hasMore ?? false,
    nextCursor: data.nextCursor ?? null,
  };
}

async function fetchNotifications(limit = 50): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  return fetchNotificationsPage(limit);
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

// Cursor-paged notifications for the center: the old single-page hook capped
// the UI at one `limit` window while `unreadCount` counted ALL unread, so
// older unread rows were unreachable. Pages append in order; the query key
// stays under ['notifications', ...] so mark-read/delete/clear-all
// invalidations still refresh every page.
export function useNotificationsInfinite(pageSize = 50) {
  return useInfiniteQuery({
    queryKey: ['notifications', 'infinite', pageSize],
    queryFn: ({ pageParam }) => fetchNotificationsPage(pageSize, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
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

export function useClearAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await browserApiRequest('/api/notifications', { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not clear notifications.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
