'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { Skeleton } from '@quant/shared-ui';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      type: 'spring' as const,
      ...spring.gentle,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, ...spring.gentle },
  },
};

export default function Loading() {
  return (
    <div className="flex flex-col h-dvh bg-[var(--quant-background)]">
      <div className="p-4 border-b border-[var(--quant-border)]">
        <Skeleton variant="text" width="150px" height="24px" />
      </div>
      <motion.div
        className="flex-1 p-4 space-y-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div key={i} className="flex items-center gap-3" variants={itemVariants}>
            <Skeleton variant="circle" width="48px" height="48px" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="120px" height="16px" />
              <Skeleton variant="text" width="200px" height="14px" />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
