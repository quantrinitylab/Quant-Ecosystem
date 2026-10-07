// ============================================================================
// Shared UI - Notification Center Component
// ============================================================================

import React from 'react';

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  app?: string;
}

export interface NotificationCenterProps {
  notifications: Notification[];
  onMarkRead?: (id: string) => void;
  onClear?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onMarkRead,
  onClear,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Notification center"
    >
      <div className="fixed inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div className="fixed top-16 right-4 w-96 max-h-[32rem] bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          {notifications.length > 0 && (
            <button
              onClick={onClear}
              className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Clear all notifications"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto" role="list" aria-label="Notifications list">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No notifications</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                  !notification.read ? 'bg-blue-50' : ''
                }`}
                role="listitem"
                onClick={() => onMarkRead?.(notification.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {notification.title}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{notification.body}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {notification.app && (
                        <span className="text-xs text-gray-400">{notification.app}</span>
                      )}
                      <span className="text-xs text-gray-400">{notification.time}</span>
                    </div>
                  </div>
                  {!notification.read && (
                    <span
                      className="flex-shrink-0 w-2 h-2 mt-2 bg-blue-500 rounded-full"
                      aria-label="Unread"
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
