'use client';

// ============================================================================
// @quant/shared-ui - Appy v1.1.2 Offline Resilience & Sync Progress Banner
// ============================================================================

import { FC, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  NetworkStatus,
  OfflineMutationQueue,
  QueuedMutation,
  offlineMutationQueue as defaultQueue,
} from './network-quality';

export interface OfflineSyncBannerProps {
  /** Optional status override: 'online' | 'offline' | 'syncing' */
  status?: NetworkStatus | 'syncing';
  /** Number of pending changes to display. Defaults to counting queue items. */
  pendingCount?: number;
  /** Whether a flush is currently in progress. */
  isSyncing?: boolean;
  /** Explicit flag to force-show the completion badge */
  hasSynced?: boolean;
  /** Mutation queue instance to observe (defaults to singleton offlineMutationQueue) */
  queue?: OfflineMutationQueue;
  /** Duration in ms to display "All changes synced" before fading out (default: 3000ms) */
  autoHideDuration?: number;
  /** Optional manual sync trigger */
  onSync?: () => void;
  /** Custom className for the outer container */
  className?: string;
  /** Screen position */
  position?: 'top' | 'bottom' | 'relative';
}

export const OfflineSyncBanner: FC<OfflineSyncBannerProps> = ({
  status: propStatus,
  pendingCount: propPendingCount,
  isSyncing: propIsSyncing,
  hasSynced: propHasSynced,
  queue,
  autoHideDuration = 3000,
  onSync,
  className = '',
  position = 'top',
}) => {
  const activeQueue = queue ?? defaultQueue;

  // Track live online/offline state if propStatus is not provided
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  // Track queue items
  const [queueState, setQueueState] = useState<QueuedMutation[]>(() => {
    return activeQueue.getAllMutations();
  });

  // Track whether queue is flushing
  const [queueFlushing, setQueueFlushing] = useState<boolean>(() => {
    return activeQueue.getIsFlushing();
  });

  // Completion flash state
  const [showSyncedNotice, setShowSyncedNotice] = useState<boolean>(false);
  const wasSyncingRef = useRef<boolean>(false);
  const wasOfflineRef = useRef<boolean>(false);
  const hadPendingRef = useRef<boolean>(false);
  const lastSyncedAtRef = useRef<number | undefined>(activeQueue.getLastSyncedAt());

  // Subscribe to queue changes
  useEffect(() => {
    const unsubscribe = activeQueue.subscribe((mutations) => {
      setQueueState(mutations);
      setQueueFlushing(activeQueue.getIsFlushing());

      const latestSyncedAt = activeQueue.getLastSyncedAt();
      if (latestSyncedAt && latestSyncedAt !== lastSyncedAtRef.current) {
        lastSyncedAtRef.current = latestSyncedAt;
        if (propStatus !== 'offline' && (!propStatus ? isOnline : true)) {
          setShowSyncedNotice(true);
        }
      }
    });
    return unsubscribe;
  }, [activeQueue, propStatus, isOnline]);

  // Window network event listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Determine effective status
  const effectiveStatus: NetworkStatus | 'syncing' =
    propStatus !== undefined
      ? propStatus
      : !isOnline
        ? 'offline'
        : propIsSyncing || queueFlushing
          ? 'syncing'
          : 'online';

  const pendingItems = queueState.filter((m) => m.status === 'PENDING');
  const count = propPendingCount !== undefined ? propPendingCount : pendingItems.length;

  const isFlushing = propIsSyncing ?? (effectiveStatus === 'syncing' || queueFlushing);

  // Track offline and pending history
  useEffect(() => {
    if (effectiveStatus === 'offline') {
      wasOfflineRef.current = true;
    }
    if (count > 0) {
      hadPendingRef.current = true;
    }
  }, [effectiveStatus, count]);

  // Detect completion transition from syncing -> completed
  useEffect(() => {
    if (propHasSynced) {
      setShowSyncedNotice(true);
      const timer = setTimeout(() => setShowSyncedNotice(false), autoHideDuration);
      return () => clearTimeout(timer);
    }

    const justTransitionedFromOffline =
      wasOfflineRef.current &&
      (hadPendingRef.current || queueState.some((m) => m.status === 'COMPLETED')) &&
      effectiveStatus === 'online';

    const justFinishedSyncing =
      wasSyncingRef.current && !isFlushing && effectiveStatus !== 'offline';

    if (justTransitionedFromOffline || justFinishedSyncing) {
      setShowSyncedNotice(true);
      wasOfflineRef.current = false;
      hadPendingRef.current = false;
      wasSyncingRef.current = false;
      const timer = setTimeout(() => setShowSyncedNotice(false), autoHideDuration);
      return () => clearTimeout(timer);
    }

    wasSyncingRef.current = isFlushing;
  }, [isFlushing, effectiveStatus, propHasSynced, autoHideDuration, queueState]);

  const isOffline = effectiveStatus === 'offline';
  const shouldRenderBanner = isOffline || isFlushing || showSyncedNotice || propHasSynced;

  const positionClasses =
    position === 'top'
      ? 'fixed top-0 left-0 right-0 z-50'
      : position === 'bottom'
        ? 'fixed bottom-0 left-0 right-0 z-50'
        : 'relative w-full z-10';

  return (
    <div
      className={`${positionClasses} pointer-events-none ${className}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="wait">
        {shouldRenderBanner && (
          <motion.aside
            key={isOffline ? 'offline' : isFlushing ? 'syncing' : 'synced'}
            aria-label="Network synchronization status"
            className="pointer-events-auto flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium shadow-md backdrop-blur-md transition-colors"
            style={{
              backgroundColor: isOffline
                ? 'rgba(245, 158, 11, 0.95)'
                : isFlushing
                  ? 'rgba(37, 99, 235, 0.95)'
                  : 'rgba(16, 185, 129, 0.95)',
              color: '#ffffff',
            }}
            initial={{ opacity: 0, y: position === 'bottom' ? 20 : -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: position === 'bottom' ? 20 : -20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          >
            {/* OFFLINE STATE */}
            {isOffline && (
              <div className="flex items-center gap-2.5">
                {/* Reconnect Pulse Indicator */}
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-200 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                </span>

                {/* Cloud Offline Icon */}
                <svg
                  className="h-4 w-4 shrink-0 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3l18 18M9.88 9.88A3 3 0 1014.12 14.12m5.01-1.39A5 5 0 0018 7h-1.26a8 8 0 00-11.62 9"
                  />
                </svg>

                <span>Offline Mode — Changes will sync when reconnected</span>

                {count > 0 && (
                  <span
                    className="ml-1.5 rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-100"
                    aria-label={`${count} mutations pending`}
                  >
                    {count} queued
                  </span>
                )}
              </div>
            )}

            {/* SYNCING / FLUSHING STATE */}
            {!isOffline && isFlushing && (
              <div className="flex items-center gap-2.5">
                {/* Animated Spinner Icon */}
                <svg
                  className="h-4 w-4 shrink-0 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>

                <span>Syncing {count} pending changes...</span>
              </div>
            )}

            {/* ALL CHANGES SYNCED STATE */}
            {!isOffline && !isFlushing && (showSyncedNotice || propHasSynced) && (
              <div className="flex items-center gap-2.5">
                {/* Success Checkmark Icon */}
                <svg
                  className="h-4 w-4 shrink-0 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>

                <span>All changes synced</span>
              </div>
            )}

            {/* Manual Sync Trigger Button (if callback provided) */}
            {onSync && isOffline && (
              <button
                type="button"
                onClick={onSync}
                className="ml-2 rounded bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-white underline hover:bg-amber-900/50 focus:outline-none"
              >
                Retry now
              </button>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
};
