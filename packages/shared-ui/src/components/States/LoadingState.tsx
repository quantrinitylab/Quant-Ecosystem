'use client';

// ============================================================================
// Shared UI - Loading State Component
// ============================================================================

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMotionConfig } from '../Motion/MotionConfig';

export interface LoadingStateProps {
  variant?: 'spinner' | 'skeleton' | 'dots';
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  variant = 'spinner',
  text,
  size = 'md',
  animated = true,
}) => {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className="flex flex-col items-center justify-center p-8"
      role="status"
      aria-label={text || 'Loading'}
    >
      {variant === 'spinner' &&
        (shouldAnimate ? (
          <motion.svg
            className={`${sizeMap[size]} text-[var(--brand-primary)]`}
            fill="none"
            viewBox="0 0 24 24"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </motion.svg>
        ) : (
          <svg
            className={`${sizeMap[size]} text-[var(--brand-primary)]`}
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ))}
      {variant === 'skeleton' && (
        <div className="w-full max-w-sm space-y-3">
          <div
            className={`h-4 bg-[var(--quant-muted)] rounded w-3/4${shouldAnimate ? ' animate-pulse' : ''}`}
          />
          <div
            className={`h-4 bg-[var(--quant-muted)] rounded w-full${shouldAnimate ? ' animate-pulse' : ''}`}
          />
          <div
            className={`h-4 bg-[var(--quant-muted)] rounded w-2/3${shouldAnimate ? ' animate-pulse' : ''}`}
          />
        </div>
      )}
      {variant === 'dots' &&
        (shouldAnimate ? (
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-2 h-2 bg-[var(--brand-primary)] rounded-full"
                animate={{ y: [0, -6, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-[var(--brand-primary)] rounded-full" />
            <span className="w-2 h-2 bg-[var(--brand-primary)] rounded-full" />
            <span className="w-2 h-2 bg-[var(--brand-primary)] rounded-full" />
          </div>
        ))}
      {text && <p className="mt-3 text-sm text-[var(--quant-muted-foreground)]">{text}</p>}
    </div>
  );
};
