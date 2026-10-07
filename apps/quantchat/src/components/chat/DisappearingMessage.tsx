'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ============================================================================
// Task 14.9: DisappearingMessage
//
// Wraps a disappearing message. Once the message has been viewed, a countdown
// begins for `durationSeconds`; when it elapses the message is removed from the
// view and `onExpire` is called so the caller can delete it from the backend.
// A circular countdown overlay animates the remaining view time.
//
// Requirements: 18.2 (delete after timer expires post-view), 18.4 (countdown)
// ============================================================================

export interface DisappearingMessageProps {
  /** Message id (passed back to onExpire). */
  messageId: string;
  /** Disappear duration in seconds (must be > 0 to count down). */
  durationSeconds: number;
  /**
   * Whether the message has been viewed by the recipient. The countdown only
   * starts once this becomes true (Requirement 18.2: "after being viewed").
   */
  isViewed: boolean;
  /** Called once the timer elapses; caller deletes the message. */
  onExpire: (messageId: string) => void;
  /** The message content to render. */
  children: React.ReactNode;
}

export const DisappearingMessage: React.FC<DisappearingMessageProps> = ({
  messageId,
  durationSeconds,
  isViewed,
  onExpire,
  children,
}) => {
  const [remaining, setRemaining] = useState<number>(durationSeconds);
  const [expired, setExpired] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    // Only run the countdown once the message has been viewed.
    if (!isViewed || durationSeconds <= 0 || expired) return;

    const deadline = Date.now() + durationSeconds * 1000;
    setRemaining(durationSeconds);

    intervalRef.current = setInterval(() => {
      const secsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(secsLeft);
      if (secsLeft <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setExpired(true);
        onExpireRef.current(messageId);
      }
    }, 250);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isViewed, durationSeconds, expired, messageId]);

  const progress = durationSeconds > 0 ? Math.max(0, Math.min(1, remaining / durationSeconds)) : 0;

  const RADIUS = 9;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const isUrgent = remaining <= 3 && remaining > 0;

  return (
    <AnimatePresence>
      {!expired && (
        <motion.div
          className="disappearing-message"
          initial={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92, filter: 'blur(4px)' }}
          transition={{ duration: 0.3 }}
          style={{ position: 'relative', display: 'inline-block' }}
        >
          {children}

          {isViewed && durationSeconds > 0 && (
            <div
              className="disappearing-message__countdown"
              aria-label={`Disappears in ${remaining}s`}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width={24} height={24} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r={RADIUS} fill="rgba(0,0,0,0.45)" />
                <motion.circle
                  cx="12"
                  cy="12"
                  r={RADIUS}
                  fill="none"
                  stroke={isUrgent ? '#ff453a' : '#fffc00'}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                  transform="rotate(-90 12 12)"
                  animate={isUrgent ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
                  transition={isUrgent ? { duration: 0.6, repeat: Infinity } : { duration: 0.25 }}
                />
              </svg>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DisappearingMessage;
