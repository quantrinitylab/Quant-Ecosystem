'use client';

// ============================================================================
// Shared UI - SkeletonGrid Component
// Renders N SkeletonCards in a responsive grid layout
// ============================================================================

import React from 'react';
import { SkeletonCard } from './SkeletonCard';
import type { SkeletonCardProps } from './SkeletonCard';

export interface SkeletonGridProps {
  count?: number;
  columns?: string;
  cardProps?: Omit<SkeletonCardProps, 'className'>;
  className?: string;
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
  count = 8,
  columns = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  cardProps,
  className = '',
}) => {
  return (
    <div
      className={`grid gap-4 ${columns} ${className}`}
      role="status"
      aria-label="Loading grid"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} {...cardProps} />
      ))}
    </div>
  );
};
