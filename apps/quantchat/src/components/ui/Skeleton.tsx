'use client';

import React from 'react';

/**
 * Skeleton — Loading placeholder with shimmer animation.
 *
 * Variants:
 *   - `line`   — A single text line (default height: 16px)
 *   - `circle` — A circular avatar placeholder
 *   - `rect`   — A rectangular block placeholder
 *   - `card`   — A card-shaped placeholder with rounded corners
 *
 * Usage:
 *   <Skeleton variant="card" className="w-full h-48" />
 *   <Skeleton variant="circle" className="w-12 h-12" />
 *   <Skeleton variant="line" className="w-3/4" />
 */

export type SkeletonVariant = 'line' | 'circle' | 'rect' | 'card';

interface SkeletonProps {
  /** Shape variant of the skeleton placeholder */
  variant?: SkeletonVariant;
  /** Additional CSS classes for sizing and positioning */
  className?: string;
  /** Number of line skeletons to render (only for variant="line") */
  count?: number;
}

const variantClasses: Record<SkeletonVariant, string> = {
  line: 'h-4 w-full rounded',
  circle: 'rounded-full',
  rect: 'rounded-md',
  card: 'rounded-xl',
};

export function Skeleton({ variant = 'rect', className = '', count = 1 }: SkeletonProps) {
  if (variant === 'line' && count > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`skeleton-shimmer bg-neutral-200 dark:bg-neutral-800 ${variantClasses.line} ${i === count - 1 ? 'w-3/4' : 'w-full'} ${className}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`skeleton-shimmer bg-neutral-200 dark:bg-neutral-800 ${variantClasses[variant]} ${className}`}
    />
  );
}

/**
 * SkeletonGroup — Convenience wrapper for common skeleton patterns.
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <Skeleton variant="card" className="w-full h-48" />
      <Skeleton variant="line" className="w-3/4" />
      <Skeleton variant="line" className="w-1/2" />
    </div>
  );
}

export function SkeletonAvatar({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Skeleton variant="circle" className="w-10 h-10" />
      <div className="flex-1 space-y-2">
        <Skeleton variant="line" className="w-1/3" />
        <Skeleton variant="line" className="w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonAvatar key={i} />
      ))}
    </div>
  );
}

export default Skeleton;
