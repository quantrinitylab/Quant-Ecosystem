'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMotionConfig } from './MotionConfig';

export interface AnimatedSkeletonProps {
  variant?: 'text' | 'circle' | 'rect';
  width?: string;
  height?: string;
  className?: string;
  animated?: boolean;
}

const variantStyles: Record<string, React.CSSProperties> = {
  text: { borderRadius: '4px', height: '1em', width: '100%' },
  circle: { borderRadius: '50%', width: '40px', height: '40px' },
  rect: { borderRadius: '8px', width: '100%', height: '100px' },
};

export function AnimatedSkeleton({
  variant = 'rect',
  width,
  height,
  className,
  animated = true,
}: AnimatedSkeletonProps) {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;
  const baseStyle = variantStyles[variant];

  const style: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: '#e2e8f0',
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };

  if (!shouldAnimate) {
    return (
      <div
        className={className}
        style={{ ...style, opacity: 0.7 }}
        role="status"
        aria-busy="true"
      />
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      role="status"
      aria-busy="true"
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
