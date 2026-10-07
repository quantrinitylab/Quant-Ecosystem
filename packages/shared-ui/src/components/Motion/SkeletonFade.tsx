'use client';

// ============================================================================
// Shared UI - SkeletonFade Component
// ============================================================================

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface SkeletonFadeProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
}

export const SkeletonFade: React.FC<SkeletonFadeProps> = ({
  loading,
  skeleton,
  children,
  className = '',
  animated = true,
}) => {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const transition = {
    type: 'spring' as const,
    ...spring.gentle,
  };

  if (!shouldAnimate) {
    return (
      <div className={className} style={{ position: 'relative' }}>
        {loading ? skeleton : children}
      </div>
    );
  }

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
