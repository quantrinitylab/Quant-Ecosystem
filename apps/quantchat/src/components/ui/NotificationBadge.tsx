'use client';

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BRAND_SPRINGS } from '../../lib/motion-tokens';
import { useChatSocket } from '../../hooks/useChatSocket';

// ============================================================================
// Task 11.7: Notification Red Dot Badges
// - Small red dot (8px) on navigation items
// - Appears within 500ms of a WebSocket unread event
// - Animate entrance with scale spring
//
// QM-UIUX-060: migrated from the dead RealtimeProvider (`/ws`) to the working
// `chatSocket` singleton (`/ws/chat`) via useChatSocket. The singleton's real
// unread signal is `new_message` (normalized from the backend's
// `chat.message.created.v1` envelope); legacy passthrough `unread` / `read`
// frames keep their previous semantics, including `itemId` attribution —
// an event only affects a badge with an `itemId` when the event explicitly
// carries that same itemId (in `payload` or `data`).
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

  // Refs keep the socket handler identity stable (useChatSocket re-registers
  // when the handler identity changes) while always reading the latest props.
  const itemIdRef = useRef(itemId);
  itemIdRef.current = itemId;
  const externalVisibleRef = useRef(externalVisible);
  externalVisibleRef.current = externalVisible;

  const handleSocketEvent = useCallback((event: any) => {
    if (externalVisibleRef.current !== undefined) return; // external control takes precedence

    const currentItemId = itemIdRef.current;
    // Normalized events carry their payload in `data`; legacy passthrough
    // frames may use `payload` or flat fields.
    const source = event?.data ?? event?.payload ?? event;
    const eventItemId: string | undefined = source?.itemId ?? event?.itemId;

    if (event?.type === 'unread') {
      if (!currentItemId || eventItemId === currentItemId) {
        setHasUnread(true);
      }
    } else if (event?.type === 'read') {
      if (!currentItemId || eventItemId === currentItemId) {
        setHasUnread(false);
      }
    } else if (event?.type === 'new_message') {
      // A real inbound message is an unread signal. With an itemId set, only
      // an explicitly attributed event counts (same rule as `unread` above).
      if (!currentItemId || eventItemId === currentItemId) {
        setHasUnread(true);
      }
    }
  }, []);

  useChatSocket(handleSocketEvent);

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
