// ============================================================================
// QuantSync - Notifications Page
// Notification center with tabs, filters, mark all read, action context
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface Notification {
  id: string;
  type: 'like' | 'repost' | 'reply' | 'follow' | 'mention' | 'quote' | 'community' | 'space';
  actorName: string;
  actorHandle: string;
  actorAvatar: string;
  content: string;
  targetId?: string;
  targetPreview?: string;
  isRead: boolean;
  createdAt: string;
}

type NotifTab = 'all' | 'mentions' | 'replies' | 'follows';

const NOTIF_ICONS: Record<string, string> = {
  like: '❤️',
  repost: '🔄',
  reply: '💬',
  follow: '👤',
  mention: '@',
  quote: '📝',
  community: '🏘️',
  space: '🎙️',
};

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<NotifTab>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [filterType, setFilterType] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.set('type', activeTab);
      if (filterType) params.set('filter', filterType);
      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load notifications');
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterType]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await fetch('/api/notifications/read-all', { method: 'POST' });
  }, []);

  const markAsRead = useCallback(async (notifId: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await fetch(`/api/notifications/${notifId}/read`, { method: 'POST' });
  }, []);

  const getTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString();
  };

  const getNotificationText = (notif: Notification): string => {
    switch (notif.type) {
      case 'like':
        return 'liked your post';
      case 'repost':
        return 'reposted your post';
      case 'reply':
        return 'replied to your post';
      case 'follow':
        return 'followed you';
      case 'mention':
        return 'mentioned you';
      case 'quote':
        return 'quoted your post';
      case 'community':
        return notif.content;
      case 'space':
        return notif.content;
      default:
        return notif.content;
    }
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-500">Loading notifications...</span>
      </div>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load notifications</div>
        <button
          onClick={fetchNotifications}
          className="px-6 py-2 bg-blue-500 text-white rounded-full"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-sm text-blue-500 hover:text-blue-700">
                Mark all read
              </button>
            )}
            <select
              value={filterType || ''}
              onChange={(e) => setFilterType(e.target.value || null)}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="">All types</option>
              <option value="like">Likes</option>
              <option value="repost">Reposts</option>
              <option value="reply">Replies</option>
              <option value="follow">Follows</option>
              <option value="mention">Mentions</option>
            </select>
          </div>
        </div>
        <div className="flex border-b">
          {(['all', 'mentions', 'replies', 'follows'] as NotifTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-center text-sm font-medium capitalize ${
                activeTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-500'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {notifications.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔔</div>
          <h3 className="text-lg font-semibold text-gray-700">No notifications yet</h3>
          <p className="text-gray-500 mt-1">
            When people interact with your posts, you will see it here.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => markAsRead(notif.id)}
              className={`px-4 py-3 hover:bg-gray-50 cursor-pointer flex gap-3 ${!notif.isRead ? 'bg-blue-50/50' : ''}`}
            >
              <div className="w-8 h-8 flex items-center justify-center text-lg flex-shrink-0">
                {NOTIF_ICONS[notif.type] || '🔔'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <img
                    src={notif.actorAvatar}
                    alt=""
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-bold">{notif.actorName}</span>{' '}
                      <span className="text-gray-600">{getNotificationText(notif)}</span>
                    </p>
                    {notif.targetPreview && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 border-l-2 border-gray-200 pl-2">
                        {notif.targetPreview}
                      </p>
                    )}
                    <span className="text-xs text-gray-400 mt-1">
                      {getTimeAgo(notif.createdAt)}
                    </span>
                  </div>
                  {!notif.isRead && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
