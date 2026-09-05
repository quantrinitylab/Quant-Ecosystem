'use client';

// ============================================================================
// Shared UI - Offline/Online Status Indicator Component
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

export interface OfflineIndicatorProps {
  onStatusChange?: (status: ConnectionStatus) => void;
  syncMessage?: string;
  /** When provided, controls the syncing state externally instead of using a hardcoded timeout. */
  isSyncing?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  onStatusChange,
  syncMessage = 'Syncing changes...',
  isSyncing,
}) => {
  const [status, setStatus] = useState<ConnectionStatus>('online');

  /*
    Whether this connection has ever dropped, which is the difference between
    "nothing to report" and "recovered". Without it the live region below would
    have to hold a permanent "you are online" that a reader hears as page content
    on every visit — and with it, the recovery is announced exactly once, on the
    transition that earns it. A ref, not state: it is set during the offline
    transition, which re-renders on its own, and the render that flips back to
    'online' reads a value committed long before it.
  */
  const wasOffline = useRef(false);

  // Respond to external isSyncing prop changes
  useEffect(() => {
    if (isSyncing === undefined) return;
    if (isSyncing && status !== 'offline') {
      setStatus('syncing');
      onStatusChange?.('syncing');
    } else if (!isSyncing && status === 'syncing') {
      setStatus('online');
      onStatusChange?.('online');
    }
  }, [isSyncing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOnline = useCallback(() => {
    setStatus('syncing');
    onStatusChange?.('syncing');
    // If isSyncing prop is provided, let the parent control the transition.
    // Otherwise fall back to a timeout for backward compat.
    if (isSyncing === undefined) {
      setTimeout(() => {
        setStatus('online');
        onStatusChange?.('online');
      }, 2000);
    }
  }, [onStatusChange, isSyncing]);

  const handleOffline = useCallback(() => {
    wasOffline.current = true;
    setStatus('offline');
    onStatusChange?.('offline');
  }, [onStatusChange]);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  /*
    `navigator.onLine` used to be read in the state initializer. This component
    renders on the server too, where the answer is always 'online', so reading it
    during the first client render is a hydration mismatch — React throws the
    subtree away and re-renders it, which is the one moment the banner is meant to
    be on screen. Reading it in a mount effect also means the live region's first
    content arrives as a *change*, which is the only kind of live-region content a
    screen reader reliably announces.

    Empty deps deliberately: `handleOffline` closes over `onStatusChange`, and a
    consumer passing an inline arrow would otherwise re-run this on every render
    and re-fire the callback for as long as the connection stayed down.
  */
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) handleOffline();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    /*
      The live region is the wrapper, and it is always mounted. `role="status"`
      used to sit on the banner itself, one line below an `if (status === 'online')
      return null` — so the region came into existence at the same instant it first
      had text, which is the case screen readers most often miss entirely, and it
      stopped existing the moment the connection came back, so the recovery was
      announced by nothing at all. A live region has to be there and quiet before
      it can speak.

      `aria-atomic` means the whole region is re-read on any change, so the banner's
      own words are the announcement — no hidden copy shadowing a visible one, and
      one string in the source per state. The wrapper takes the fixed positioning
      the banner used to own; empty, it is 0px tall, and `pointer-events-none` keeps
      a ghost bar from eating a click on the way out now that the exit animation
      actually runs.
    */
    <div
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {/*
        `AnimatePresence` used to wrap a child that an early return above it had
        already decided to render, so it never saw an unmount and `exit` was dead
        code — the banner vanished in one frame instead of sliding away. The
        condition belongs inside it.
      */}
      <AnimatePresence>
        {status !== 'online' && (
          <motion.div
            key="banner"
            className="flex items-center justify-center py-2 px-4"
            style={{
              background: status === 'offline' ? '#fbbf24' : '#60a5fa',
              color: status === 'offline' ? '#78350f' : '#1e3a5f',
            }}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {status === 'offline' && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3l18 18"
                  />
                </svg>
                <span>You are offline. Changes will be synced when connection is restored.</span>
              </div>
            )}
            {status === 'syncing' && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{syncMessage}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Coming back is the half that had no words at all: the banner is gone by
        then, and a banner that stayed to say so would be a permanent bar. So the
        recovery lives here, for the reader only, and only once a drop has actually
        happened — on a first load that was online all along there is nothing to
        report and the region stays empty.
      */}
      {status === 'online' && wasOffline.current && (
        <span className="sr-only">Back online. Your changes have been synced.</span>
      )}
    </div>
  );
};
