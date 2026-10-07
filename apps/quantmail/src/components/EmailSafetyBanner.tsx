'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './InboxToast';
import type { Email } from '../types';

interface EmailSafetyBannerProps {
  email: Email;
}

/**
 * Displays contextual safety banners:
 * - Phishing warning for high phishing scores
 * - Medium phishing warning for borderline scores
 * - Unsubscribe button for promotional/newsletter emails
 * - First-time sender indicator
 */
export function EmailSafetyBanner({ email }: EmailSafetyBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const isHighPhishing = (email.phishingScore ?? 0) > 70;
  const isMediumPhishing = (email.phishingScore ?? 0) > 40 && !isHighPhishing;
  const isPromotion = email.category === 'promotions' || email.category === 'social';
  const hasUnsubscribeHeader = email.headers?.['list-unsubscribe'] != null;
  const showUnsubscribe = isPromotion || hasUnsubscribeHeader;

  // Detect first-time sender (no prior messages from this address)
  const isFirstTimeSender = !email.isRead && email.from?.email && !email.inReplyTo;

  const handleReport = useCallback(() => {
    showToast({ text: 'Reported as phishing. We\'ll review this sender.', type: 'success' });
    setDismissed((prev) => new Set([...prev, 'phishing']));
  }, []);

  const handleTrustSender = useCallback(() => {
    showToast({ text: `Trusted ${email.from?.name || email.from?.email}`, type: 'info' });
    setDismissed((prev) => new Set([...prev, 'phishing', 'medium']));
  }, [email.from]);

  const handleUnsubscribe = useCallback(() => {
    showToast({ text: `Unsubscribed from ${email.from?.name || email.from?.email}`, type: 'success' });
    setDismissed((prev) => new Set([...prev, 'unsubscribe']));
  }, [email.from]);

  if (!isHighPhishing && !isMediumPhishing && !showUnsubscribe && !isFirstTimeSender) return null;

  return (
    <div className="email-safety-banners">
      <AnimatePresence>
        {isHighPhishing && !dismissed.has('phishing') && (
          <motion.div
            className="safety-banner safety-banner-danger"
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="safety-banner-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div className="safety-banner-content">
              <strong>This message looks suspicious</strong>
              <p>
                QuantMail detected potential phishing patterns. Be cautious with links and
                attachments. Don&apos;t share personal information.
              </p>
            </div>
            <div className="safety-banner-actions-group">
              <button type="button" className="safety-banner-action" onClick={handleReport}>Report</button>
              <button type="button" className="safety-banner-trust" onClick={handleTrustSender}>Trust sender</button>
            </div>
          </motion.div>
        )}
        {isMediumPhishing && !dismissed.has('medium') && (
          <motion.div
            className="safety-banner safety-banner-warning"
            role="status"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="safety-banner-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <div className="safety-banner-content">
              <strong>Verify this sender</strong>
              <p>This email has some characteristics that require caution.</p>
            </div>
            <button type="button" className="safety-banner-trust" onClick={handleTrustSender}>Trust</button>
          </motion.div>
        )}
        {showUnsubscribe && !isHighPhishing && !dismissed.has('unsubscribe') && (
          <motion.div
            className="safety-banner safety-banner-info"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="safety-banner-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </span>
            <div className="safety-banner-content">
              <p>This looks like a newsletter or promotional email.</p>
            </div>
            <button type="button" className="safety-banner-unsubscribe" onClick={handleUnsubscribe}>
              Unsubscribe
            </button>
          </motion.div>
        )}
        {isFirstTimeSender && !isHighPhishing && !isMediumPhishing && !dismissed.has('first-time') && (
          <motion.div
            className="safety-banner safety-banner-neutral"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="safety-banner-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </span>
            <div className="safety-banner-content">
              <p><strong>New sender</strong> — First message from {email.from?.name || email.from?.email}</p>
            </div>
            <button
              type="button"
              className="safety-banner-dismiss"
              onClick={() => setDismissed((prev) => new Set([...prev, 'first-time']))}
              aria-label="Dismiss"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
