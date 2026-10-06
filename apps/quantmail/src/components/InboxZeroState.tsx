'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { QuantMailLogo } from './QuantMailLogo';

/**
 * Empty-inbox state — Outlook-inspired (user reference, msg#30):
 * the official QuantMail logo front and centre with a calm caption.
 * Fills the whole list area in ONE background colour — no split panels,
 * no dead blank space below.
 */
export function InboxZeroState({ query }: { query?: string }) {
  const router = useRouter();

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
        {/* Decoration, not a control: it floats on a 4.2s loop, and the only
            thing a click did was re-navigate to the inbox you are already on. */}
        <QuantMailLogo size={96} interactive={false} />
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
          <button
            type="button"
            onClick={() => router.push('/compose')}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#FF8C42] px-6 text-sm font-bold text-[#090A0C] transition-colors hover:bg-[#FF9B5A] active:bg-[#E8752F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C]"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ✎
            </span>
            Compose new email
          </button>
        </>
      )}
    </motion.div>
  );
}
