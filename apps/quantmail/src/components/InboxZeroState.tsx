'use client';

import { motion } from 'framer-motion';
import { QuantrinityMark } from './QuantrinityMark';

/**
 * Inbox Zero celebration state.
 * When inbox is completely clear, we show a premium celebration moment
 * (Gmail just shows a boring sun icon). We make reaching inbox zero feel rewarding.
 */
export function InboxZeroState() {
  return (
    <motion.div
      className="inbox-zero"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="inbox-zero-glow" aria-hidden="true" />
      <motion.div
        className="inbox-zero-mark"
        animate={{ rotate: [0, 5, -5, 3, -3, 0] }}
        transition={{ duration: 2, delay: 0.3, ease: 'easeInOut' }}
      >
        <QuantrinityMark label="Inbox Zero" />
      </motion.div>
      <h2 className="inbox-zero-title">Inbox Zero</h2>
      <p className="inbox-zero-subtitle">
        Everything handled. No threads need your attention.
      </p>
      <div className="inbox-zero-stats">
        <div className="inbox-zero-stat">
          <span className="inbox-zero-stat-number">✓</span>
          <span className="inbox-zero-stat-label">All caught up</span>
        </div>
        <div className="inbox-zero-stat">
          <span className="inbox-zero-stat-number">🎯</span>
          <span className="inbox-zero-stat-label">Focus achieved</span>
        </div>
        <div className="inbox-zero-stat">
          <span className="inbox-zero-stat-number">⚡</span>
          <span className="inbox-zero-stat-label">Zero noise</span>
        </div>
      </div>
      <p className="inbox-zero-cta">
        Start something new — compose, schedule, or review drafts.
      </p>
    </motion.div>
  );
}
