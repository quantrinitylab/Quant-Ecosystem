'use client';

import { motion } from 'framer-motion';
import { QuantMailLogo } from './QuantMailLogo';

/**
 * Empty-inbox state — Outlook-inspired (user reference, msg#30):
 * the official QuantMail logo front and centre with a calm caption.
 * Fills the whole list area in ONE background colour — no split panels,
 * no dead blank space below.
 */
export function InboxZeroState({ query }: { query?: string }) {
  return (
    <motion.div
      className="inbox-zero"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <motion.div
        className="inbox-zero-mark"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <QuantMailLogo size={96} title="QuantMail" />
      </motion.div>
      {query ? (
        <>
          <h2 className="inbox-zero-title">No match yet</h2>
          <p className="inbox-zero-subtitle">
            Nothing matched “{query}”. Try a sender, a subject, or a simpler phrase.
          </p>
        </>
      ) : (
        <>
          <h2 className="inbox-zero-title">All done for the day</h2>
          <p className="inbox-zero-subtitle">Enjoy your empty inbox.</p>
        </>
      )}
    </motion.div>
  );
}
