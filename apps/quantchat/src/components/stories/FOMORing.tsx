'use client';

import React from 'react';
import { shouldShowFomoRing } from '../../lib/gamification';

// ============================================================================
// Task 11.9: FOMO Ring
// - Gradient ring animation around unviewed story circles (rainbow gradient rotating at 60fps)
// - CSS conic-gradient with animation: spin 2s linear infinite
// - Only renders when story.viewed === false
// ============================================================================

interface FOMORingProps {
  /** Whether the story has been viewed */
  viewed: boolean;
  /** Size of the ring (diameter in px) */
  size?: number;
  /** Ring border width in px */
  borderWidth?: number;
  /** Child content (avatar/image inside the ring) */
  children: React.ReactNode;
  className?: string;
}

export function FOMORing({
  viewed,
  size = 64,
  borderWidth = 3,
  children,
  className = '',
}: FOMORingProps) {
  if (!shouldShowFomoRing(viewed)) {
    // No FOMO ring for viewed stories — just a subtle gray border
    return (
      <div
        className={`rounded-full p-[2px] bg-gray-300 dark:bg-gray-600 ${className}`}
        style={{ width: size, height: size }}
      >
        <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-gray-900">
          {children}
        </div>
      </div>
    );
  }

  // Unviewed: spinning rainbow gradient ring at 60fps
  return (
    <div
      className={`relative rounded-full fomo-ring-container ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Spinning gradient ring */}
      <div
        className="absolute inset-0 rounded-full fomo-ring-gradient animate-fomo-spin"
        style={{ padding: borderWidth }}
      />

      {/* Inner content with gap */}
      <div
        className="absolute rounded-full overflow-hidden bg-white dark:bg-gray-900"
        style={{
          inset: borderWidth + 1,
        }}
      >
        {children}
      </div>

      {/* Inline styles for the animation */}
      <style jsx>{`
        .fomo-ring-gradient {
          background: conic-gradient(
            from 0deg,
            #ff0000,
            #ff8000,
            #ffff00,
            #00ff00,
            #0080ff,
            #8000ff,
            #ff00ff,
            #ff0000
          );
        }

        .animate-fomo-spin {
          animation: fomo-spin 2s linear infinite;
        }

        @keyframes fomo-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default FOMORing;
