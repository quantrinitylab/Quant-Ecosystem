'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { createPortal } from 'react-dom';

interface Notification {
  id: string;
  type: 'email' | 'calendar' | 'security' | 'system';
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
}

// Read-state persists across refreshes: once a notification is marked read it
// stays read (localStorage), fixing "mark all read" resetting on reload.
const READ_STORAGE_KEY = 'quant.notifications.read.v1';
// Deleted notifications never come back (msg#30 P17).
const DELETED_STORAGE_KEY = 'quant.notifications.deleted.v1';

const SEED_NOTIFICATIONS: Array<Omit<Notification, 'read' | 'timestamp'>> = [
  {
    id: 'welcome',
    type: 'system',
    title: 'Welcome to QuantMail',
    body: 'Your workspace is ready. Compose your first email to get started.',
  },
];

function loadIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveIds(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage unavailable — state lives for this session only */
  }
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [panelPosition, setPanelPosition] = useState({ left: 16, top: 72 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Hydrate on mount so server and client render the same initial markup.
  useEffect(() => {
    const readIds = loadIds(READ_STORAGE_KEY);
    const deletedIds = loadIds(DELETED_STORAGE_KEY);
    setNotifications(
      SEED_NOTIFICATIONS.filter((n) => !deletedIds.includes(n.id)).map((n) => ({
        ...n,
        timestamp: new Date(),
        read: readIds.includes(n.id),
      })),
    );
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: PointerEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const positionPanel = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 32);
      setPanelPosition({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: Math.min(rect.bottom + 8, window.innerHeight - 120),
      });
    };

    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [isOpen]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveIds(
        READ_STORAGE_KEY,
        next.map((n) => n.id),
      );
      return next;
    });
  }, []);

  // Delete one notification — via the × button or a swipe-to-trash gesture
  // (msg#30 P17). Deletions persist so it never resurfaces.
  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    saveIds(DELETED_STORAGE_KEY, [...loadIds(DELETED_STORAGE_KEY), id]);
  }, []);

  const clearAll = useCallback(() => {
    setNotifications((prev) => {
      saveIds(DELETED_STORAGE_KEY, [...loadIds(DELETED_STORAGE_KEY), ...prev.map((n) => n.id)]);
      return [];
    });
  }, []);

  const handleDragEnd = useCallback(
    (id: string) => (_: unknown, info: PanInfo) => {
      if (Math.abs(info.offset.x) > 90) deleteNotification(id);
    },
    [deleteNotification],
  );

  const iconByType: Record<Notification['type'], string> = {
    email: '✉️',
    calendar: '📅',
    security: '🔒',
    system: '🔔',
  };

  return (
    <div className="notification-bell-wrapper">
      <button
        ref={buttonRef}
        type="button"
        className="notification-bell"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount}
          </span>
        )}
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                className="notification-panel"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                style={{ left: panelPosition.left, top: panelPosition.top }}
              >
                <header className="notification-panel-header">
                  <div className="notification-panel-heading">
                    <h2>Notifications</h2>
                    <p className="notification-panel-sub">
                      Quant-only — mail, calendar, security. Sign-in across Quant apps runs through
                      QuantMail.
                    </p>
                  </div>
                  <div className="notification-panel-actions">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="notification-mark-read"
                        onClick={markAllRead}
                      >
                        Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button type="button" className="notification-mark-read" onClick={clearAll}>
                        Clear all
                      </button>
                    )}
                  </div>
                </header>
                <div className="notification-panel-list">
                  {notifications.length === 0 ? (
                    <p className="notification-empty">No notifications — all clear</p>
                  ) : (
                    notifications.map((n) => (
                      <motion.div
                        key={n.id}
                        className={`notification-item ${n.read ? '' : 'is-unread'}`}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.7}
                        onDragEnd={handleDragEnd(n.id)}
                        exit={{ opacity: 0, x: 120, height: 0, marginTop: 0, marginBottom: 0 }}
                        layout
                      >
                        <span className="notification-item-icon">{iconByType[n.type]}</span>
                        <div className="notification-item-content">
                          <p className="notification-item-title">{n.title}</p>
                          <p className="notification-item-body">{n.body}</p>
                          <time className="notification-item-time">
                            {n.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                        <button
                          type="button"
                          className="notification-item-delete"
                          aria-label={`Delete notification: ${n.title}`}
                          onClick={() => deleteNotification(n.id)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <path d="m6 6 12 12M18 6 6 18" />
                          </svg>
                        </button>
                      </motion.div>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <p className="notification-panel-hint">
                    Swipe a notification sideways — or tap × — to delete it.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
