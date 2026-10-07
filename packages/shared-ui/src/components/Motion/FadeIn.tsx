'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { duration } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface FadeInProps {
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  duration?: number;
  className?: string;
  children: React.ReactNode;
  animated?: boolean;
}

const directionOffsets: Record<string, { x?: number; y?: number }> = {
  up: { y: 20 },
  down: { y: -20 },
  left: { x: 20 },
  right: { x: -20 },
};

export function FadeIn({
  direction,
  delay = 0,
  duration: durationOverride,
  className,
  children,
  animated = true,
}: FadeInProps) {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const durationSec = durationOverride ?? duration.normal / 1000;
  const offset = direction ? directionOffsets[direction] : {};

  if (!shouldAnimate) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: durationSec, delay, ease: [0.0, 0.0, 0.2, 1.0] }}
    >
      {children}
    </motion.div>
  );
}
