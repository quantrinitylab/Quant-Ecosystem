'use client';

// ============================================================================
// Shared UI - Skeleton Component
// ============================================================================

import React from 'react';
import { useReducedMotion } from 'framer-motion';

export interface SkeletonProps {
  variant?: 'text' | 'circle' | 'rect';
  width?: string;
  height?: string;
  animate?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  animate = true,
  className = '',
  'aria-label': ariaLabel = 'Loading content',
}) => {
  const prefersReducedMotion = useReducedMotion();

  const variantStyles: Record<string, string> = {
    text: 'h-4 rounded',
    circle: 'rounded-full',
    rect: 'rounded-lg',
  };

  const animateStyles = animate && !prefersReducedMotion ? 'animate-pulse' : '';

  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  if (variant === 'circle' && !width && !height) {
    style.width = '40px';
    style.height = '40px';
  }

  if (variant === 'rect' && !height) {
    style.height = '100px';
  }

  return (
    <div
      className={`bg-gray-200 dark:bg-gray-700 ${variantStyles[variant]} ${animateStyles} ${className}`}
      style={style}
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    />
  );
};
