'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface ScaleOnHoverProps {
  scale?: number;
  className?: string;
  children: React.ReactNode;
  animated?: boolean;
}

export function ScaleOnHover({
  scale = 1.02,
  className,
  children,
  animated = true,
}: ScaleOnHoverProps) {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  if (!shouldAnimate) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      whileHover={{ scale }}
      transition={{
        type: 'spring',
        damping: spring.snappy.damping,
        stiffness: spring.snappy.stiffness,
        mass: spring.snappy.mass,
      }}
    >
      {children}
    </motion.div>
  );
}
