'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  LoadingState,
  ErrorState,
  EmptyState,
  PageTransition,
  StaggerList,
} from '@quant/shared-ui';
import { quantSyncAPI } from '../../services/api-client';
import type { Notification } from '../../types';

export default function NotificationsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await quantSyncAPI.getNotifications();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load notifications');
      }
      return response.data || [];
    },
  });

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Notifications</h1>

        {isLoading && <LoadingState text="Loading notifications..." />}

        {isError && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load notifications'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && data && data.length === 0 && (
          <EmptyState
            title="No notifications"
            description="You're all caught up! New notifications will appear here."
          />
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <StaggerList className="space-y-3">
            {data.map((notification: Notification) => (
              <Card
                key={notification.id}
                className={`p-4 border dark:border-gray-800 ${
                  notification.isRead
                    ? 'bg-white dark:bg-[var(--quant-card)]'
                    : 'bg-blue-50 dark:bg-blue-900/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {notification.message}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(notification.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </StaggerList>
        )}
      </main>
    </PageTransition>
  );
}
