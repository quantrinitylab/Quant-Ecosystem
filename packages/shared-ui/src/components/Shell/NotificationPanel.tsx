'use client';

// ============================================================================
// Shared UI - Enhanced Notification Panel Component
// ============================================================================

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  app: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  onClick: () => void;
}

export interface NotificationPanelProps {
  notifications: NotificationItem[];
  isOpen: boolean;
  onClose: () => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onDismiss?: (id: string) => void;
  onSnooze?: (id: string) => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  notifications,
  isOpen,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onSnooze,
}) => {
  const [filterApp, setFilterApp] = useState<string | null>(null);

  // Get unique apps for filter
  const apps = useMemo(() => {
    const appSet = new Set(notifications.map((n) => n.app));
    return Array.from(appSet);
  }, [notifications]);

  // Badge counts per app
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      if (!n.read) {
        counts[n.app] = (counts[n.app] ?? 0) + 1;
      }
    }
    return counts;
  }, [notifications]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    if (!filterApp) return notifications;
    return notifications.filter((n) => n.app === filterApp);
  }, [notifications, filterApp]);

  // Grouped notifications by app
  const groupedNotifications = useMemo(() => {
    const groups: Record<string, NotificationItem[]> = {};
    for (const n of filteredNotifications) {
      if (!groups[n.app]) groups[n.app] = [];
      groups[n.app]!.push(n);
    }
    return groups;
  }, [filteredNotifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50"
        role="dialog"
        aria-modal="true"
        aria-label="Notification panel"
      >
        <div className="fixed inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />
        <motion.div
          className="fixed top-16 right-4 w-full max-w-md max-h-[32rem] rounded-xl shadow-xl flex flex-col overflow-hidden"
          style={{
            background: 'var(--quant-surface, #ffffff)',
            border: '1px solid var(--quant-border, #e5e7eb)',
          }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: '1px solid var(--quant-border, #e5e7eb)' }}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--quant-text, #111827)' }}>
                Notifications
              </h2>
              {unreadCount > 0 && (
                <span
                  className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full"
                  aria-label={`${unreadCount} unread`}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                aria-label="Mark all as read"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* App filter tabs */}
          {apps.length > 1 && (
            <div
              className="flex items-center gap-1 px-4 py-2 overflow-x-auto"
              role="tablist"
              aria-label="Filter by app"
              style={{ borderBottom: '1px solid var(--quant-border, #e5e7eb)' }}
            >
              <button
                role="tab"
                aria-selected={!filterApp}
                onClick={() => setFilterApp(null)}
                className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  background: !filterApp ? 'var(--quant-surface-hover, #f3f4f6)' : 'transparent',
                  color: 'var(--quant-text, #111827)',
                }}
              >
                All
              </button>
              {apps.map((app) => (
                <button
                  key={app}
                  role="tab"
                  aria-selected={filterApp === app}
                  onClick={() => setFilterApp(app)}
                  className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    background:
                      filterApp === app ? 'var(--quant-surface-hover, #f3f4f6)' : 'transparent',
                    color: 'var(--quant-text, #111827)',
                  }}
                >
                  {app}
                  {badgeCounts[app] ? ` (${badgeCounts[app]})` : ''}
                </button>
              ))}
            </div>
          )}

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto" role="list" aria-label="Notifications list">
            {filteredNotifications.length === 0 ? (
              <div
                className="p-8 text-center text-sm"
                style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
              >
                No notifications
              </div>
            ) : (
              Object.entries(groupedNotifications).map(([app, items]) => (
                <div key={app}>
                  <div
                    className="px-4 py-1 text-xs font-semibold uppercase"
                    style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                  >
                    {app}
                  </div>
                  {items.map((notification) => (
                    <div
                      key={notification.id}
                      className="px-4 py-3 cursor-pointer"
                      style={{
                        borderBottom: '1px solid var(--quant-border, #e5e7eb)',
                        background: !notification.read
                          ? 'var(--quant-surface-hover, #f3f4f6)'
                          : 'transparent',
                      }}
                      role="listitem"
                      onClick={() => onMarkRead?.(notification.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: 'var(--quant-text, #111827)' }}
                          >
                            {notification.title}
                          </p>
                          <p
                            className="text-sm mt-0.5 line-clamp-2"
                            style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                          >
                            {notification.body}
                          </p>
                          <span
                            className="text-xs mt-1 inline-block"
                            style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                          >
                            {notification.time}
                          </span>
                        </div>
                        {!notification.read && (
                          <span
                            className="flex-shrink-0 w-2 h-2 mt-2 bg-blue-500 rounded-full"
                            aria-label="Unread"
                          />
                        )}
                      </div>

                      {/* Inline actions */}
                      <div className="flex items-center gap-2 mt-2">
                        {notification.actions?.map((action) => (
                          <button
                            key={action.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              action.onClick();
                            }}
                            className="text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            style={{
                              background: 'var(--quant-surface-hover, #f3f4f6)',
                              color: 'var(--quant-text, #111827)',
                            }}
                          >
                            {action.label}
                          </button>
                        ))}
                        {onSnooze && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSnooze(notification.id);
                            }}
                            className="text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            style={{
                              background: 'var(--quant-surface-hover, #f3f4f6)',
                              color: 'var(--quant-text-secondary, #6b7280)',
                            }}
                            aria-label={`Snooze notification: ${notification.title}`}
                          >
                            Snooze
                          </button>
                        )}
                        {onDismiss && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDismiss(notification.id);
                            }}
                            className="text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            style={{
                              background: 'var(--quant-surface-hover, #f3f4f6)',
                              color: 'var(--quant-text-secondary, #6b7280)',
                            }}
                            aria-label={`Dismiss notification: ${notification.title}`}
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
