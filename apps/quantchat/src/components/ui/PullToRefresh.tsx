'use client';

import React, { useState, useRef, useCallback, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import { BRAND_SPRINGS } from '../../lib/motion-tokens';

// ============================================================================
// Task 11.2: Pull-to-Refresh Spring Animation
// - Framer Motion spring (BRAND_SPRINGS.bounce), 400ms animation
// - CSS haptic vibration effect (50ms scale pulse at pull threshold)
// - Wraps any scrollable content
// ============================================================================

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
  /** Pull distance threshold to trigger refresh (px) */
  threshold?: number;
  /** Whether the content is currently refreshing */
  isRefreshing?: boolean;
  className?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  isRefreshing: externalRefreshing,
  className = '',
}: PullToRefreshProps) {
  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const isRefreshing = externalRefreshing ?? internalRefreshing;
  const [isPulling, setIsPulling] = useState(false);
  const [hasTriggeredHaptic, setHasTriggeredHaptic] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pullDistance = useMotionValue(0);
  const controls = useAnimation();

  // Transform pull distance to indicator opacity and rotation
  const indicatorOpacity = useTransform(pullDistance, [0, threshold * 0.5, threshold], [0, 0.5, 1]);
  const indicatorRotation = useTransform(pullDistance, [0, threshold], [0, 360]);
  const indicatorScale = useTransform(pullDistance, [0, threshold * 0.8, threshold], [0.5, 0.9, 1]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || container.scrollTop > 0 || isRefreshing) return;

    startY.current = e.touches[0].clientY;
    setIsPulling(true);
    setHasTriggeredHaptic(false);
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, (currentY - startY.current) * 0.5); // resistance factor
    pullDistance.set(distance);

    // Haptic pulse at threshold (50ms scale pulse)
    if (distance >= threshold && !hasTriggeredHaptic) {
      setHasTriggeredHaptic(true);
      controls.start({
        scale: [1, 1.05, 1],
        transition: { duration: 0.05 },
      });
    }
  }, [isPulling, isRefreshing, threshold, hasTriggeredHaptic, pullDistance, controls]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    setIsPulling(false);

    const distance = pullDistance.get();

    if (distance >= threshold && !isRefreshing) {
      setInternalRefreshing(true);
      // Animate to resting refresh position
      pullDistance.set(threshold * 0.6);

      try {
        await onRefresh();
      } finally {
        setInternalRefreshing(false);
      }
    }

    // Spring back to 0 using BRAND_SPRINGS.bounce
    pullDistance.set(0);
  }, [isPulling, isRefreshing, threshold, onRefresh, pullDistance]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Pull indicator */}
      <motion.div
        className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
        style={{
          height: threshold,
          opacity: indicatorOpacity,
        }}
      >
        <motion.div
          animate={controls}
          style={{
            scale: indicatorScale,
            rotate: indicatorRotation,
          }}
          className="w-8 h-8 rounded-full border-2 border-t-transparent border-purple-500"
        />
      </motion.div>

      {/* Content wrapper with spring physics */}
      <motion.div
        ref={containerRef}
        className="h-full overflow-y-auto"
        style={{ y: pullDistance }}
        transition={{
          type: 'spring',
          ...BRAND_SPRINGS.bounce,
          duration: 0.4,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </motion.div>
    </div>
  );
}

export default PullToRefresh;
