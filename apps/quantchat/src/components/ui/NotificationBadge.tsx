'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BRAND_SPRINGS } from '../../lib/motion-tokens';
import { useRealtime } from '../../providers/realtime-context';

// ============================================================================
// Task 11.7: Notification Red Dot Badges
// - Small red dot (8px) on navigation items
// - Appears within 500ms of WebSocket unread event (subscribe to 'notifications' channel)
// - Animate entrance with scale spring
// ============================================================================

interface NotificationBadgeProps {
  /** Navigation item identifier to track unread state for */
  itemId?: string;
  /** Override: manually control visibility */
  isVisible?: boolean;
  /** Show count instead of just dot (optional) */
  count?: number;
  /** Position offset */
  className?: string;
  children: React.ReactNode;
}

export function NotificationBadge({
  itemId,
  isVisible: externalVisible,
  count,
  className = '',
  children,
}: NotificationBadgeProps) {
  const [hasUnread, setHasUnread] = useState(false);
  const { subscribe } = useRealtime();

  // Subscribe to WebSocket 'notifications' channel for unread events
  useEffect(() => {
    if (externalVisible !== undefined) return; // external control takes precedence

    const unsubscribe = subscribe('notifications', (event) => {
      if (event.type === 'unread' && (!itemId || event.payload?.itemId === itemId)) {
        setHasUnread(true);
      }
      if (event.type === 'read' && (!itemId || event.payload?.itemId === itemId)) {
        setHasUnread(false);
      }
    });

    return unsubscribe;
  }, [subscribe, itemId, externalVisible]);

  const showDot = externalVisible ?? hasUnread;

  return (
    <div className={`relative inline-flex ${className}`}>
      {children}

      <AnimatePresence>
        {showDot && (
          <motion.div
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              type: 'spring',
              ...BRAND_SPRINGS.bounce,
            }}
          >
            {count !== undefined && count > 0 ? (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationBadge;
