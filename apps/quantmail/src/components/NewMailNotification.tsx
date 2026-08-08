'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface NewMailNotificationProps {
  count: number;
  latestSender?: string;
  latestSubject?: string;
  onDismiss: () => void;
  onClick: () => void;
}

/**
 * Floating "new mail" notification bar that slides in from the top.
 * Gmail refreshes silently — we proactively tell you what arrived.
 */
export function NewMailNotification({
  count,
  latestSender,
  latestSubject,
  onDismiss,
  onClick,
}: NewMailNotificationProps) {
  const [isVisible, setIsVisible] = useState(count > 0);

  useEffect(() => {
    setIsVisible(count > 0);
  }, [count]);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [isVisible, onDismiss]);

  const handleClick = useCallback(() => {
    setIsVisible(false);
    onClick();
  }, [onClick]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="new-mail-notification"
          initial={{ opacity: 0, y: -40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onClick={handleClick}
          role="status"
          aria-live="polite"
        >
          <div className="new-mail-pulse" aria-hidden="true" />
          <div className="new-mail-content">
            <strong>
              {count === 1
                ? '1 new message'
                : `${count} new messages`}
            </strong>
            {latestSender && (
              <span className="new-mail-preview">
                {latestSender}{latestSubject ? ` — ${latestSubject}` : ''}
              </span>
            )}
          </div>
          <button
            type="button"
            className="new-mail-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setIsVisible(false);
              onDismiss();
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
