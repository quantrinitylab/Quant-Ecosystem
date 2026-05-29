'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { duration } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface PageTransitionProps {
  className?: string;
  children: React.ReactNode;
  animated?: boolean;
}

export function PageTransition({ className, children, animated = true }: PageTransitionProps) {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  if (!shouldAnimate) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.moderate / 1000, ease: [0.0, 0.0, 0.2, 1.0] }}
    >
      {children}
    </motion.div>
  );
}
