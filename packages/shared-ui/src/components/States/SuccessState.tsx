'use client';

// ============================================================================
// Shared UI - Success State Component
// ============================================================================

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMotionConfig } from '../Motion/MotionConfig';

export interface SuccessStateProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  animated?: boolean;
}

export const SuccessState: React.FC<SuccessStateProps> = ({
  title = 'Success',
  message,
  actionLabel,
  onAction,
  animated = true,
}) => {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const textContent = (
    <>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-4">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          // 36px before; a finger-sized target below `sm` like the other states.
          className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </>
  );

  if (!shouldAnimate) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" role="status">
        <svg
          className="w-16 h-16 mb-4 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {textContent}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="status">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 10, stiffness: 200 }}
      >
        <svg
          className="w-16 h-16 mb-4 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <motion.path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          />
        </svg>
      </motion.div>
      {textContent}
    </div>
  );
};
