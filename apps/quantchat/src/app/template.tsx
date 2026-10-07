'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { BRAND_SPRINGS, pageTransitionVariants } from '../lib/motion-tokens';

/**
 * Next.js App Router Template
 *
 * This file wraps page content in AnimatePresence + motion.div to provide
 * shared layout transitions across route changes. Uses the `snappy` spring
 * to complete within 300ms (stiffness:500, damping:30, mass:0.8).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={typeof window !== 'undefined' ? window.location.pathname : undefined}
        variants={pageTransitionVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        transition={{
          type: 'spring',
          ...BRAND_SPRINGS.snappy,
        }}
        className="min-h-dvh"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
