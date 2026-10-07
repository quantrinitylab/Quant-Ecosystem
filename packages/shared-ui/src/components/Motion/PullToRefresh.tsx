'use client';

// ============================================================================
// Shared UI - PullToRefresh Component
// ============================================================================

import React, { useCallback, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  className?: string;
  animated?: boolean;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  children,
  onRefresh,
  threshold = 80,
  className = '',
  animated = true,
}) => {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;
  const [refreshing, setRefreshing] = useState(false);
  const y = useMotionValue(0);
  const indicatorOpacity = useTransform(y, [0, threshold], [0, 1]);
  const indicatorRotation = useTransform(y, [0, threshold], [0, 360]);

  const transition = {
    type: 'spring' as const,
    ...spring.gentle,
  };

  const handleDragEnd = useCallback(async () => {
    if (y.get() >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  }, [onRefresh, threshold, refreshing, y]);

  if (!shouldAnimate) {
    // Reduced-motion: keep the drag gesture so users can still trigger refresh,
    // but use instant (duration: 0) transitions instead of spring physics.
    // No rotation animation - show a static indicator instead.
    const instantTransition = { duration: 0 };
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <motion.div
          className="flex items-center justify-center py-2"
          style={{ opacity: refreshing ? 1 : indicatorOpacity }}
        >
          <div
            className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"
            aria-label={refreshing ? 'Refreshing' : undefined}
          />
        </motion.div>
        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: threshold }}
          dragElastic={0.4}
          onDragEnd={handleDragEnd}
          style={{ y }}
          transition={instantTransition}
        >
          {children}
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <motion.div
        className="flex items-center justify-center py-2"
        style={{ opacity: indicatorOpacity }}
      >
        <motion.div
          className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"
          style={{ rotate: indicatorRotation }}
          animate={refreshing ? { rotate: 360 } : undefined}
          transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : undefined}
        />
      </motion.div>
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: threshold }}
        dragElastic={0.4}
        onDragEnd={handleDragEnd}
        style={{ y }}
        transition={transition}
      >
        {children}
      </motion.div>
    </div>
  );
};
