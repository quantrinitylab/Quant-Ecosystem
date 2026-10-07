// ============================================================================
// QuantChat - FeaturedBadge (Task 13.7)
// Visual "Featured" badge shown on top-ranked Spotlight reels.
// ============================================================================
'use client';

import { motion } from 'framer-motion';

export function FeaturedBadge() {
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-black shadow"
    >
      ⭐ Featured
    </motion.span>
  );
}

export default FeaturedBadge;
