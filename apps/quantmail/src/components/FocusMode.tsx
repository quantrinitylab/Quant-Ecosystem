'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface FocusModeProps {
  isActive: boolean;
  onToggle: () => void;
  unreadCount: number;
  focusCount: number;
}

/**
 * Focus Mode indicator and toggle.
 * When active, only shows emails from known contacts and important senders.
 * Everything else gets batched for later review.
 * 
 * This is Superhuman's #1 differentiator — we include it natively.
 */
export function FocusMode({ isActive, onToggle, unreadCount, focusCount }: FocusModeProps) {
  return (
    <div className="focus-mode-wrapper">
      <button
        type="button"
        className={`focus-mode-toggle ${isActive ? 'is-active' : ''}`}
        onClick={onToggle}
        aria-pressed={isActive}
        title={isActive ? 'Exit Focus Mode' : 'Enter Focus Mode'}
      >
        <span className="focus-mode-icon" aria-hidden="true">
          {isActive ? '◉' : '○'}
        </span>
        <span className="focus-mode-label">
          {isActive ? 'Focus' : 'All mail'}
        </span>
        {isActive && focusCount > 0 && (
          <span className="focus-mode-count">{focusCount}</span>
        )}
      </button>
      <AnimatePresence>
        {isActive && (
          <motion.div
            className="focus-mode-badge"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            <span className="focus-mode-badge-dot" />
            {unreadCount - focusCount} batched for later
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Focus Mode Banner shown at the top of the inbox when focus mode filters are active.
 */
export function FocusModeBanner({ 
  batchedCount, 
  onReview 
}: { 
  batchedCount: number; 
  onReview: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || batchedCount === 0) return null;

  return (
    <motion.div
      className="focus-banner"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <div className="focus-banner-content">
        <span className="focus-banner-icon">🎯</span>
        <span>
          <strong>Focus Mode active.</strong> {batchedCount} less-important{' '}
          {batchedCount === 1 ? 'email' : 'emails'} batched.
        </span>
      </div>
      <div className="focus-banner-actions">
        <button type="button" onClick={onReview}>
          Review batched
        </button>
        <button type="button" onClick={() => setDismissed(true)}>
          ×
        </button>
      </div>
    </motion.div>
  );
}
