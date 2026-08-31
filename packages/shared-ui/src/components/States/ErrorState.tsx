'use client';

// ============================================================================
// Shared UI - Error State Component
// ============================================================================

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from '../Motion/MotionConfig';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  animated?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  animated = true,
}) => {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const icon = (
    <svg
      className="w-16 h-16 mb-4 text-red-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
  );

  const textContent = (
    <>
      <h3 className="text-lg font-semibold text-[var(--quant-foreground)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--quant-muted-foreground)] max-w-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          // 36px before. Retry is the only way out of an error state, so it gets a
          // finger-sized target below `sm`.
          className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-medium text-white bg-[var(--quant-destructive)] rounded-lg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-destructive)] focus-visible:ring-offset-2"
        >
          {retryLabel}
        </button>
      )}
    </>
  );

  if (!shouldAnimate) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
        {icon}
        {textContent}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', ...spring.bouncy }}
      >
        {icon}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        {textContent}
      </motion.div>
    </div>
  );
};
