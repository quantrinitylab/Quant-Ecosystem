'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { isStreakUrgent } from '../../lib/gamification';
import type { StreakData } from '../../providers/MicroInteractionProvider';

// ============================================================================
// Task 11.10: Streak Urgency
// - Fire emoji 🔥 with pulsing animation (scale 1→1.3→1, 0.8s loop)
// - Red/orange urgency coloring on the chat thread background
// - Shows when streak.hoursRemaining < 4
// ============================================================================

interface StreakUrgencyProps {
  /** Streak data for this friend pair */
  streak: StreakData;
  /** Whether to show as a background overlay on the chat thread */
  showBackground?: boolean;
  /** Compact mode (smaller emoji, for list items) */
  compact?: boolean;
  className?: string;
}

export function StreakUrgency({
  streak,
  showBackground = false,
  compact = false,
  className = '',
}: StreakUrgencyProps) {
  // Only show when streak is urgent (< 4 hours remaining)
  if (!streak.isUrgent || !isStreakUrgent(streak.hoursRemaining)) {
    return null;
  }

  const urgencyLevel =
    streak.hoursRemaining < 1 ? 'critical' : streak.hoursRemaining < 2 ? 'high' : 'medium';

  const bgGradient = {
    critical: 'from-red-500/20 to-orange-500/10',
    high: 'from-orange-500/15 to-yellow-500/5',
    medium: 'from-orange-400/10 to-transparent',
  }[urgencyLevel];

  const textColor = {
    critical: 'text-red-500',
    high: 'text-orange-500',
    medium: 'text-orange-400',
  }[urgencyLevel];

  return (
    <div className={`relative ${className}`}>
      {/* Background urgency overlay */}
      {showBackground && (
        <div
          className={`absolute inset-0 bg-gradient-to-r ${bgGradient} rounded-lg pointer-events-none`}
        />
      )}

      {/* Fire emoji with pulsing animation */}
      <div className="flex items-center gap-1.5 relative z-10">
        <motion.span
          className={compact ? 'text-base' : 'text-xl'}
          animate={{
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          🔥
        </motion.span>

        {!compact && (
          <span className={`text-xs font-semibold ${textColor}`}>
            {streak.hoursRemaining < 1
              ? 'Expiring soon!'
              : `${Math.ceil(streak.hoursRemaining)}h left`}
          </span>
        )}

        {/* Streak count */}
        <span className={`text-xs font-bold ${textColor}`}>{streak.count}</span>
      </div>
    </div>
  );
}

/**
 * StreakUrgencyBackground — Wraps a chat thread with urgency coloring.
 * Use this as a wrapper around the entire chat conversation container.
 */
interface StreakUrgencyBackgroundProps {
  streak: StreakData | undefined;
  children: React.ReactNode;
  className?: string;
}

export function StreakUrgencyBackground({
  streak,
  children,
  className = '',
}: StreakUrgencyBackgroundProps) {
  const isUrgent = streak?.isUrgent && isStreakUrgent(streak.hoursRemaining);

  if (!isUrgent) {
    return <div className={className}>{children}</div>;
  }

  const urgencyLevel =
    streak.hoursRemaining < 1 ? 'critical' : streak.hoursRemaining < 2 ? 'high' : 'medium';

  const borderColor = {
    critical: 'border-red-500/30',
    high: 'border-orange-500/20',
    medium: 'border-orange-400/10',
  }[urgencyLevel];

  return (
    <div className={`relative border-l-2 ${borderColor} ${className}`}>
      {/* Subtle urgency gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none rounded-lg" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default StreakUrgency;
