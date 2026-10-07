'use client';

// ============================================================================
// Shared UI - OptimisticWrapper Component
// Wraps children to show pending/success indicator on mutations
// ============================================================================

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';

export interface OptimisticWrapperProps {
  children: React.ReactNode;
  isPending?: boolean;
  isSuccess?: boolean;
  className?: string;
}

export const OptimisticWrapper: React.FC<OptimisticWrapperProps> = ({
  children,
  isPending = false,
  isSuccess = false,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className={`relative ${className}`}>
      <div className={isPending ? 'opacity-70 transition-opacity' : ''}>{children}</div>
      <AnimatePresence>
        {isPending && !prefersReducedMotion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-5 h-5 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" />
          </motion.div>
        )}
        {isSuccess && !prefersReducedMotion && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', ...spring.snappy }}
            className="absolute top-1 right-1 pointer-events-none"
          >
            <div className="w-5 h-5 rounded-full bg-[var(--quant-success)] flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
