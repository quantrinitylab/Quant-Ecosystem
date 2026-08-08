'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Notification {
  id: string;
  type: 'email' | 'calendar' | 'security' | 'system';
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'system',
      title: 'Welcome to QuantMail',
      body: 'Your workspace is ready. Compose your first email to get started.',
      timestamp: new Date(),
      read: false,
    },
  ]);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">{unreadCount}</span>
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            className="notification-panel"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            <header className="notification-panel-header">
              <h2>Notifications</h2>
              {unreadCount > 0 && (
                <button type="button" className="notification-mark-read" onClick={markAllRead}>
                  Mark all read
                </button>
              )}
            </header>
            <div className="notification-panel-list">
              {notifications.length === 0 ? (
                <p className="notification-empty">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`notification-item ${n.read ? '' : 'is-unread'}`}>
                    <span className="notification-item-icon">{iconByType[n.type]}</span>
                    <div className="notification-item-content">
                      <p className="notification-item-title">{n.title}</p>
                      <p className="notification-item-body">{n.body}</p>
                      <time className="notification-item-time">
                        {n.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
