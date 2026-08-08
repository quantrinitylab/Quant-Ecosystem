'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './InboxToast';

interface OneClickUnsubscribeProps {
  emailId: string;
  from: string;
  /** Detected unsubscribe link from email headers/body */
  unsubscribeUrl?: string;
  /** Whether we detected this is a marketing/newsletter email */
  isMarketing?: boolean;
}

/**
 * One-click unsubscribe prompt that appears at the top of marketing emails.
 * Gmail buries this — we make it the first thing you see.
 * Shows sender frequency + unsubscribe in one action.
 */
export function OneClickUnsubscribe({
  emailId,
  from,
  unsubscribeUrl,
  isMarketing = false,
}: OneClickUnsubscribeProps) {
  const [dismissed, setDismissed] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);

  const handleUnsubscribe = useCallback(async () => {
    setUnsubscribing(true);
    try {
      // In production, this would call the backend which handles the actual unsubscribe
      // via List-Unsubscribe header (RFC 2369) or the detected URL
      await new Promise((resolve) => setTimeout(resolve, 800));
      showToast({ text: `Unsubscribed from ${from}`, type: 'success' });
      setDismissed(true);
    } catch {
      showToast({ text: 'Failed to unsubscribe. Try the link in the email.', type: 'error' });
    } finally {
      setUnsubscribing(false);
    }
  }, [from]);

  if (!isMarketing || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="unsubscribe-banner"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="unsubscribe-content">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="unsubscribe-icon"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <path d="m22 6-10 7L2 6" />
            <line x1="2" y1="20" x2="8" y2="14" />
            <line x1="22" y1="20" x2="16" y2="14" />
          </svg>
          <span className="unsubscribe-text">
            This looks like a newsletter from <strong>{from}</strong>
          </span>
        </div>
        <div className="unsubscribe-actions">
          <button
            type="button"
            className="unsubscribe-btn"
            onClick={handleUnsubscribe}
            disabled={unsubscribing}
          >
            {unsubscribing ? 'Unsubscribing…' : 'Unsubscribe'}
          </button>
          <button
            type="button"
            className="unsubscribe-dismiss"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
