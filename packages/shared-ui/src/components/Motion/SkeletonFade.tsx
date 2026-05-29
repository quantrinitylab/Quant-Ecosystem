// ============================================================================
// Shared UI - SkeletonFade Component
// ============================================================================

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '@quant/brand';

export interface SkeletonFadeProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SkeletonFade: React.FC<SkeletonFadeProps> = ({
  loading,
  skeleton,
  children,
  className = '',
}) => {
  const transition = {
    type: 'spring' as const,
    ...spring.gentle,
  };

  return (
    <div className={className} style={{ position: 'relative' }}>
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
