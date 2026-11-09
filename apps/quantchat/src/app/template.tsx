'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BRAND_SPRINGS, pageTransitionVariants } from '../lib/motion-tokens';

/**
 * Next.js App Router Template
 *
 * This file wraps page content in AnimatePresence + motion.div to provide
 * shared layout transitions across route changes. Uses the `snappy` spring
 * to complete within 300ms (stiffness:500, damping:30, mass:0.8).
 *
 * QC-F-014: framer-motion SSRs the `initial` variant as an inline
 * `opacity:0` style, so every page — including fully static public pages
 * (/support, /privacy, /terms) — shipped invisible HTML and painted
 * nothing until the JS bundle loaded, hydrated, and ran the enter
 * animation. The transition is therefore enabled only after client
 * mount: SSR + hydration render with `initial={false}` (content visible
 * immediately), while route changes re-mount with a fresh key and keep
 * their enter/exit animation. Flipping `initial` after mount does not
 * restart the animation (framer-motion applies `initial` at mount only),
 * so there is no flash.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    setAnimated(true);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={typeof window !== 'undefined' ? window.location.pathname : undefined}
        variants={pageTransitionVariants}
        initial={animated ? 'initial' : false}
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
