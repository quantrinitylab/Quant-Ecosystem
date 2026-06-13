'use client';

// ============================================================================
// Shared UI - Offline/Online Status Indicator Component
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
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
  const [status, setStatus] = useState<ConnectionStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
  );

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

  if (status === 'online') return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 px-4"
        style={{
          background: status === 'offline' ? '#fbbf24' : '#60a5fa',
          color: status === 'offline' ? '#78350f' : '#1e3a5f',
        }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
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
    </AnimatePresence>
  );
};
