'use client';

// ============================================================================
// Shared UI - SkeletonCard Component
// A card with animated shimmer for loading placeholders
// ============================================================================

import React from 'react';

export interface SkeletonCardProps {
  rows?: number;
  hasImage?: boolean;
  aspectRatio?: 'video' | 'square' | 'portrait';
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  rows = 3,
  hasImage = true,
  aspectRatio = 'video',
  className = '',
}) => {
  const aspectClass =
    aspectRatio === 'video'
      ? 'aspect-video'
      : aspectRatio === 'square'
        ? 'aspect-square'
        : 'aspect-[3/4]';

  return (
    <div
      className={`rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] overflow-hidden ${className}`}
      role="status"
      aria-label="Loading content"
      aria-busy="true"
    >
      {hasImage && (
        <div className={`${aspectClass} w-full bg-[var(--quant-muted)] animate-pulse`} />
      )}
      <div className="p-3 space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-[var(--quant-muted)] animate-pulse"
            style={{ width: i === 0 ? '90%' : i === rows - 1 ? '50%' : '75%' }}
          />
        ))}
      </div>
    </div>
  );
};
