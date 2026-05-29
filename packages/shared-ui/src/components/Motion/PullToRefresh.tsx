// ============================================================================
// Shared UI - PullToRefresh Component
// ============================================================================

import React, { useCallback, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { spring } from '@quant/brand';

export interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  className?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  children,
  onRefresh,
  threshold = 80,
  className = '',
}) => {
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
