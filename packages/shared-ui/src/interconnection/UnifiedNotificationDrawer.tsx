// ============================================================================
// Quant Ecosystem - Unified Notification Drawer
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { CoreQuantAppId, UnifiedNotificationItem } from './types';
import { CORE_QUANT_APPS } from './constants';
import { NotificationBus } from './NotificationBus';

export interface UnifiedNotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenItem?: (item: UnifiedNotificationItem) => void;
}

export const UnifiedNotificationDrawer: React.FC<UnifiedNotificationDrawerProps> = ({
  isOpen,
  onClose,
  onOpenItem,
}) => {
  const [notifications, setNotifications] = useState<UnifiedNotificationItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<CoreQuantAppId | 'all'>('all');

  useEffect(() => {
    const bus = NotificationBus.getInstance();
    const unsubscribe = bus.subscribe((items) => {
      setNotifications(items);
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const bus = NotificationBus.getInstance();
  const filtered =
    selectedFilter === 'all'
      ? notifications
      : notifications.filter((n) => n.app === selectedFilter);

  const unreadTotal = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    bus.markAllAsRead(selectedFilter === 'all' ? undefined : selectedFilter);
  };

  const handleItemClick = (item: UnifiedNotificationItem) => {
    bus.markAsRead(item.id);
    if (onOpenItem) {
      onOpenItem(item);
    } else {
      window.location.href = item.deepLink;
    }
    onClose();
  };

  const filterTabs: Array<{ id: CoreQuantAppId | 'all'; label: string }> = [
    { id: 'all', label: 'All Alerts' },
    { id: 'quantmail', label: 'Mail' },
    { id: 'quantchat', label: 'Chat' },
    { id: 'quantgram', label: 'Gram' },
    { id: 'quantai', label: 'AI Canvas' },
    { id: 'quantads', label: 'Ads' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Unified Notification Center"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        className="relative w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col z-10 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Notifications</h2>
            {unreadTotal > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                {unreadTotal} new
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {unreadTotal > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-2 px-4 border-b border-gray-100 dark:border-gray-800 overflow-x-auto text-xs bg-gray-50/50 dark:bg-gray-900/40">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilter(tab.id)}
              className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                selectedFilter === tab.id
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notification Stream */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/80">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-xs">
              <span className="text-3xl block mb-2">🎉</span>
              All caught up! No notifications in this view.
            </div>
          ) : (
            filtered.map((item) => {
              const appMeta = CORE_QUANT_APPS[item.app];

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                    !item.read
                      ? 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {/* App Badge Icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-xs mt-0.5"
                    style={{
                      backgroundColor: `${appMeta.accentColor}20`,
                      color: appMeta.accentColor,
                    }}
                  >
                    {appMeta.name.charAt(5)}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {formatTimeAgo(item.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
                      {item.body}
                    </p>

                    {item.mediaThumbnailUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden w-24 h-14 border border-gray-200 dark:border-gray-700">
                        <img
                          src={item.mediaThumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Inline Actions */}
                    {item.actions && item.actions.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        {item.actions.map((act) => (
                          <button
                            key={act.actionId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleItemClick(item);
                            }}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                              act.primary
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                            }`}
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!item.read && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 mt-1 flex-shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
