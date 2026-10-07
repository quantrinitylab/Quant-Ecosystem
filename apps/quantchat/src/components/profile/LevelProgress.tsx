'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BRAND_SPRINGS } from '../../lib/motion-tokens';

// ============================================================================
// Task 11.11: XP System — Level Progress Bar
// - Horizontal progress bar showing XP toward next level
// - Level calculation: level = Math.floor(xp / 1000) + 1
// - XP per action: send_message:10, post_story:25, post_reel:50, maintain_streak:15/day
// ============================================================================

interface LevelProgressProps {
  /** Total XP accumulated */
  xp: number;
  /** Current level (calculated from XP) */
  level?: number;
  /** Whether to show XP numbers */
  showNumbers?: boolean;
  /** Whether to show level badge */
  showLevel?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
  className?: string;
}

export function LevelProgress({
  xp,
  level: externalLevel,
  showNumbers = true,
  showLevel = true,
  compact = false,
  className = '',
}: LevelProgressProps) {
  // Guard against undefined/NaN xp (e.g. fallback identities that omit xpPoints):
  // without this the UI renders "LevelNaN" / "NaN/1000XP".
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const level =
    externalLevel !== undefined && Number.isFinite(externalLevel)
      ? Math.max(1, Math.floor(externalLevel))
      : Math.floor(safeXp / 1000) + 1;
  const xpInCurrentLevel = safeXp % 1000;
  const xpForNextLevel = 1000;
  const progress = (xpInCurrentLevel / xpForNextLevel) * 100;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-xs font-bold text-purple-500">Lv.{level}</span>
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', ...BRAND_SPRINGS.gentle }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Header: Level + XP info */}
      <div className="flex items-center justify-between mb-2">
        {showLevel && (
          <div className="flex items-center gap-2">
            <motion.div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"
              whileHover={{ scale: 1.1 }}
              transition={{ type: 'spring', ...BRAND_SPRINGS.bounce }}
            >
              <span className="text-white text-xs font-bold">{level}</span>
            </motion.div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Level {level}
            </span>
          </div>
        )}

        {showNumbers && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {xpInCurrentLevel} / {xpForNextLevel} XP
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 rounded-full relative"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', ...BRAND_SPRINGS.gentle }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </motion.div>
      </div>

      {/* Next level hint */}
      {showNumbers && (
        <p className="mt-1 text-xs text-gray-400">
          {xpForNextLevel - xpInCurrentLevel} XP to Level {level + 1}
        </p>
      )}
    </div>
  );
}

export default LevelProgress;
