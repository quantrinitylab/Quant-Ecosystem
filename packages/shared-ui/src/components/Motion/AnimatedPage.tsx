'use client';

// ============================================================================
// Shared UI - AnimatedPage Component
// ============================================================================

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export type PageTransitionVariant = 'slide-left' | 'slide-right' | 'fade' | 'scale';

export interface AnimatedPageProps {
  children: React.ReactNode;
  variant?: PageTransitionVariant;
  className?: string;
  /**
   * Key used by AnimatePresence to detect page changes.
   * For exit animations to fire, `pageKey` must change while this component
   * remains mounted. If AnimatedPage itself unmounts on navigation (e.g. in a
   * Next.js page component), exit animations will not run because
   * AnimatePresence lives inside this component. For route-level exit
   * animations, place AnimatePresence in the layout above the route slot.
   */
  pageKey?: string;
  animated?: boolean;
}

const variants = {
  'slide-left': {
    initial: { x: 30, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -30, opacity: 0 },
  },
  'slide-right': {
    initial: { x: -30, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 30, opacity: 0 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  scale: {
    initial: { scale: 0.95, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.95, opacity: 0 },
  },
} as const;

export const AnimatedPage: React.FC<AnimatedPageProps> = ({
  children,
  variant = 'fade',
  className = '',
  pageKey,
  animated = true,
}) => {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const transition = !shouldAnimate
    ? { duration: 0 }
    : {
        type: 'spring' as const,
        ...spring.gentle,
      };

  const initial = !shouldAnimate ? { opacity: 1 } : variants[variant].initial;
  const animate = !shouldAnimate ? { opacity: 1 } : variants[variant].animate;
  const exit = !shouldAnimate ? { opacity: 1 } : variants[variant].exit;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial={initial}
        animate={animate}
        exit={exit}
        transition={transition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
