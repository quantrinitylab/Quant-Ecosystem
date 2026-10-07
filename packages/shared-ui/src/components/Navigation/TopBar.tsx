'use client';

// ============================================================================
// Shared UI - Top Bar / App Header Component
// ============================================================================

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { duration } from '@quant/brand';

export interface TopBarProps {
  title?: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightActions?: React.ReactNode[];
  centerContent?: React.ReactNode;
  transparent?: boolean;
  elevated?: boolean;
  className?: string;
  animated?: boolean;
  onBack?: () => void;
  /**
   * Profile entry point (P1 mobile fix): when provided, renders a tappable
   * 44px profile avatar at the end of the right section so /profile is
   * reachable from every mobile screen (the bottom nav has no Profile tab).
   */
  profileHref?: string;
  /** Optional label for the profile avatar button (defaults to "Profile"). */
  profileLabel?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  leftAction,
  rightActions,
  centerContent,
  transparent = false,
  elevated = true,
  className = '',
  animated = true,
  onBack,
  profileHref,
  profileLabel = 'Profile',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && !prefersReducedMotion;

  const bgStyles = transparent ? 'bg-transparent' : 'bg-white';
  const shadowStyles = elevated && !transparent ? 'shadow-sm' : '';

  const content = (
    <div className="flex items-center justify-between h-14 px-4">
      {/* Left section */}
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2.5 -ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-700 hover:text-gray-900 rounded-full hover:bg-gray-100"
            aria-label="Go back"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}
        {leftAction && leftAction}
        {!centerContent && title && (
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
        )}
      </div>

      {/* Center section */}
      {centerContent && (
        <div className="flex-1 flex items-center justify-center mx-4">{centerContent}</div>
      )}

      {/* Right section */}
      <div className="flex items-center gap-1">
        {rightActions?.map((action, i) => (
          <React.Fragment key={i}>{action}</React.Fragment>
        ))}
        {profileHref && (
          <a
            href={profileHref}
            aria-label={profileLabel}
            title={profileLabel}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </a>
        )}
      </div>
    </div>
  );

  if (shouldAnimate) {
    return (
      <motion.header
        className={`sticky top-0 z-40 ${bgStyles} ${shadowStyles} safe-area-top ${className}`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal / 1000 }}
      >
        {content}
      </motion.header>
    );
  }

  return (
    <header className={`sticky top-0 z-40 ${bgStyles} ${shadowStyles} safe-area-top ${className}`}>
      {content}
    </header>
  );
};
