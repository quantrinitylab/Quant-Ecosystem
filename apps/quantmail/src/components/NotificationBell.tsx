'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { browserApiRequest } from '../services/browser-api-request';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  createdAt: string;
  isRead: boolean;
}

interface NotificationResponse {
  success: boolean;
  data?: { notifications: Notification[]; unreadCount: number };
  error?: { message?: string };
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState({ left: 16, top: 72 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await browserApiRequest('/api/notifications?limit=30');
      const payload = await response.json().catch(() => null) as NotificationResponse | null;
      if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error?.message || 'Could not load notifications.');
      setNotifications(payload.data.notifications);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const position = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 32);
      setPanelPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), top: Math.min(rect.bottom + 8, window.innerHeight - 120) });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [isOpen]);

  const markAllRead = useCallback(async () => {
    const response = await browserApiRequest('/api/notifications/read-all', { method: 'POST' });
    if (!response.ok) { setError('Could not mark notifications as read.'); return; }
    setNotifications((previous) => previous.map((notification) => ({ ...notification, isRead: true })));
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    const response = await browserApiRequest(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) { setError('Could not delete the notification.'); return; }
    setNotifications((previous) => previous.filter((notification) => notification.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    const response = await browserApiRequest('/api/notifications', { method: 'DELETE' });
    if (!response.ok) { setError('Could not clear notifications.'); return; }
    setNotifications([]);
  }, []);

  return (
    <div className="notification-bell-wrapper">
      <button ref={buttonRef} type="button" className="notification-bell" onClick={() => setIsOpen((value) => !value)} aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`} aria-haspopup="true" aria-expanded={isOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>{isOpen && <><div className="notification-backdrop" onClick={() => setIsOpen(false)} /><motion.div ref={menuRef} className="notification-panel" initial={{ opacity: 0, y: -8, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .96 }} style={{ left: panelPosition.left, top: panelPosition.top }}>
          <header className="notification-panel-header"><div className="notification-panel-heading"><h2>Notifications</h2><p className="notification-panel-sub">Mail, calendar, security, and system updates.</p></div><div className="notification-panel-actions">{unreadCount > 0 && <button type="button" className="notification-mark-read" onClick={() => void markAllRead()}>Mark all read</button>}{notifications.length > 0 && <button type="button" className="notification-mark-read" onClick={() => void clearAll()}>Clear all</button>}</div></header>
          <div className="notification-panel-list">
            {loading ? <p className="notification-empty">Loading notifications…</p> : error ? <div role="alert"><p className="notification-empty">{error}</p><button type="button" className="notification-mark-read" onClick={() => void loadNotifications()}>Retry</button></div> : notifications.length === 0 ? <p className="notification-empty">No notifications — all clear</p> : notifications.map((notification) => <motion.div key={notification.id} className={`notification-item ${notification.isRead ? '' : 'is-unread'}`} layout>
              <span className="notification-item-icon">●</span><div className="notification-item-content"><p className="notification-item-title">{notification.title}</p>{notification.body && <p className="notification-item-body">{notification.body}</p>}<time className="notification-item-time">{new Date(notification.createdAt).toLocaleString()}</time></div><button type="button" className="notification-item-delete" aria-label={`Delete notification: ${notification.title}`} onClick={() => void deleteNotification(notification.id)}>×</button>
            </motion.div>)}
          </div>
        </motion.div></>}</AnimatePresence>, document.body)}
    </div>
  );
}
