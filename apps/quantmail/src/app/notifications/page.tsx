'use client';

// ============================================================================
// QuantMail — Notifications Center (M15 / K10).
//
// The dedicated notifications screen the audit found missing: only the bell
// dropdown existed. Everything here is the real backend — GET
// /api/notifications, PATCH /api/notifications/:id/read,
// POST /api/notifications/read-all, DELETE /api/notifications/:id.
//
// Modes follow the spec's center modes where the data supports them:
// All · Unread · Read. There is no fabricated "Needs You"/"Security" bucket —
// the notification rows carry only type/priority, and inventing a classifier
// would be invented data.
// ============================================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Skeleton, ErrorState, EmptyState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  type AppNotification,
} from '../../hooks/useNotifications';
import {
  formatTime,
  isSecurityType,
  priorityTone,
  safeInternalPath,
} from './notifications-utils';

type Filter = 'all' | 'unread' | 'read';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

type IconName = 'bell' | 'trash' | 'check' | 'arrow' | 'shield';
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  bell: <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  shield: <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />,
};

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useNotifications(50);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteOne = useDeleteNotification();

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const unreadCount = data?.unreadCount ?? 0;

  const visible = useMemo(() => {
    switch (filter) {
      case 'unread':
        return notifications.filter((n) => !n.isRead);
      case 'read':
        return notifications.filter((n) => n.isRead);
      default:
        return notifications;
    }
  }, [notifications, filter]);

  const run = async (fn: () => Promise<unknown>, id?: string) => {
    setActionError(null);
    try {
      await fn();
      if (id) void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const openNotification = (notification: AppNotification) => {
    if (!notification.isRead) {
      void run(() => markRead.mutateAsync(notification.id));
    }
    // Only same-origin deep links are followed (see safeInternalPath): the
    // backend stores actionUrl, and an off-origin value is never followed.
    const target = safeInternalPath(notification.actionUrl, window.location.origin);
    if (target) router.push(target);
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--quant-border)] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
                <Icon name="bell" className="h-5 w-5" />
                Notifications
              </h1>
              <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : 'You are all caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                onClick={() => void run(() => markAllRead.mutateAsync())}
                disabled={markAllRead.isPending}
              >
                <Icon name="check" className="mr-1.5 h-4 w-4" />
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="mt-4 flex gap-2" role="tablist" aria-label="Notification filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-0 sm:h-9 ${
                  filter === f.id
                    ? 'border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]'
                    : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]'
                }`}
              >
                {f.label}
                {f.id === 'unread' && unreadCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-[var(--brand-primary)]/20 px-1.5 text-xs">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
            {actionError && (
              <p role="alert" className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
                {actionError}
              </p>
            )}

            {isLoading && (
              <div className="space-y-2" aria-label="Loading notifications">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" width="100%" height="76px" />
                ))}
              </div>
            )}

            {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

            {!isLoading && !error && notifications.length === 0 && (
              <EmptyState
                title="No notifications"
                description="When mail, calendar, drive, or security events need your attention, they will appear here."
              />
            )}

            {!isLoading && !error && notifications.length > 0 && visible.length === 0 && (
              <EmptyState
                title={filter === 'unread' ? 'No unread notifications' : 'No read notifications'}
                description={
                  filter === 'unread'
                    ? 'Everything here is read. Enjoy the quiet.'
                    : 'Nothing you have read yet. New items will land here first.'
                }
                actionLabel="Show all"
                onAction={() => setFilter('all')}
              />
            )}

            {!isLoading && !error && visible.length > 0 && (
              <ul className="overflow-hidden rounded-2xl border border-[var(--quant-border)]">
                {visible.map((notification) => (
                  <li
                    key={notification.id}
                    className={`border-b border-[var(--quant-border)] last:border-b-0 transition-colors ${
                      notification.isRead ? '' : 'bg-[var(--brand-primary)]/[0.04]'
                    }`}
                  >
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`${notification.isRead ? 'Open' : 'Mark read and open'}: ${notification.title}`}
                      >
                        <span className="flex items-center gap-2">
                          {!notification.isRead && (
                            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                          )}
                          {isSecurityType(notification.type) && (
                            <Icon name="shield" className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                          )}
                          <span className={`min-w-0 flex-1 truncate text-sm ${notification.isRead ? 'text-[var(--quant-muted-foreground)]' : 'font-semibold'}`}>
                            {notification.title}
                          </span>
                        </span>
                        {notification.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--quant-muted-foreground)]">
                            {notification.body}
                          </span>
                        )}
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          <time className="text-xs text-[var(--quant-muted-foreground)]">
                            {formatTime(notification.createdAt)}
                          </time>
                          {(notification.priority === 'HIGH' || notification.priority === 'URGENT') && (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityTone(notification.priority)}`}>
                              {notification.priority.toLowerCase()}
                            </span>
                          )}
                          {notification.sourceApp && (
                            <span className="text-[11px] text-[var(--quant-muted-foreground)]">
                              {notification.sourceApp}
                            </span>
                          )}
                          {notification.actionUrl && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--brand-primary)]">
                              Open <Icon name="arrow" className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {!notification.isRead && (
                          <button
                            type="button"
                            onClick={() => void run(() => markRead.mutateAsync(notification.id))}
                            aria-label={`Mark as read: ${notification.title}`}
                            title="Mark as read"
                            className="grid h-10 w-10 place-items-center rounded-full text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]"
                          >
                            <Icon name="check" className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void run(() => deleteOne.mutateAsync(notification.id))}
                          aria-label={`Delete notification: ${notification.title}`}
                          title="Delete"
                          className="grid h-10 w-10 place-items-center rounded-full text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-red-400"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
