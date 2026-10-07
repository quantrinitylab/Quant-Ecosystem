// ============================================================================
// QuantNeon - Notifications
// Activity feed wired to the real backend via useNotifications.
// ============================================================================

import React from 'react';
import { useRouter } from 'next/router';
import { LoadingState, ErrorState, EmptyState, PageTransition } from '@quant/shared-ui';
import { useNotifications } from '../hooks/useNotifications';

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const NotificationsPage: React.FC = () => {
  const router = useRouter();
  const { notifications, unreadCount, isLoading, error, refetch, markAllRead, markRead } =
    useNotifications();

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14] flex items-center justify-center">
          <LoadingState variant="skeleton" text="Loading notifications..." />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14] flex items-center justify-center">
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-white dark:bg-[#0F0F14] text-gray-900 dark:text-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">
              Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
            </h1>
            {unreadCount > 0 && (
              <button className="text-sm font-medium text-purple-500" onClick={() => markAllRead()}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <EmptyState title="No notifications" description="Activity will show up here" />
          ) : (
            <ul className="space-y-1" aria-label="Notifications">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left ${
                      n.read ? '' : 'bg-purple-50 dark:bg-purple-900/20'
                    }`}
                    onClick={() => {
                      markRead(n.id);
                      if (n.sourceEntityId && (n.type === 'like' || n.type === 'comment')) {
                        void router.push(`/post/${n.sourceEntityId}`);
                      } else if (n.type === 'follow' && n.sourceEntityId) {
                        void router.push(`/profile/${n.sourceEntityId}`);
                      }
                    }}
                  >
                    <img
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      src={n.fromAvatar ?? ''}
                      alt={n.fromUser}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <strong className="mr-1">{n.fromUser}</strong>
                        {n.content || n.title}
                      </p>
                      <span className="text-xs text-gray-500">{timeAgo(n.createdAt)}</span>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-purple-500" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default NotificationsPage;
