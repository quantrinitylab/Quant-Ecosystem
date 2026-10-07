'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Offline indicator bar — shows at the top of the screen when connection is lost.
 * Gmail shows a subtle bar; we show a clear, actionable indicator.
 */
export function OfflineBar() {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => { setIsOffline(true); setWasOffline(true); };
    const goOnline = () => { setIsOffline(false); };

    // Check initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Auto-hide "back online" after 3 seconds
  useEffect(() => {
    if (!isOffline && wasOffline) {
      const timer = setTimeout(() => setWasOffline(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, wasOffline]);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          className="offline-bar offline-bar--offline"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="alert"
          aria-live="assertive"
        >
          <span className="offline-dot" aria-hidden="true" />
          <span>You're offline. Some features may not work.</span>
        </motion.div>
      )}
      {!isOffline && wasOffline && (
        <motion.div
          className="offline-bar offline-bar--online"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
        >
          <span className="online-dot" aria-hidden="true" />
          <span>Back online</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
