'use client';

// ============================================================================
// QuantSync - VoteButtons Component
// Upvote/Downvote buttons with score display
// ============================================================================

import { motion } from 'framer-motion';

interface VoteButtonsProps {
  upvotes: number;
  downvotes: number;
  score: number;
  userVote: 'up' | 'down' | null;
  onUpvote: () => void;
  onDownvote: () => void;
  size?: 'small' | 'medium' | 'large';
  orientation?: 'horizontal' | 'vertical';
}

export function VoteButtons({
  upvotes: _upvotes,
  downvotes: _downvotes,
  score,
  userVote,
  onUpvote,
  onDownvote,
  size = 'medium',
  orientation = 'vertical',
}: VoteButtonsProps) {
  const sizeClasses = {
    small: 'min-h-[44px] min-w-[44px] text-xs',
    medium: 'min-h-[44px] min-w-[44px] text-sm',
    large: 'min-h-[44px] min-w-[44px] text-base',
  };

  const iconScale = {
    small: 'text-sm',
    medium: 'text-lg',
    large: 'text-xl',
  };

  const containerClasses =
    orientation === 'vertical' ? 'flex flex-col items-center gap-1' : 'flex items-center gap-2';

  return (
    <div className={containerClasses} role="group" aria-label="Vote buttons">
      <motion.button
        type="button"
        whileTap={{ scale: 1.3 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className={`${sizeClasses[size]} flex items-center justify-center rounded-md transition-colors ${
          userVote === 'up'
            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
            : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-orange-500'
        }`}
        onClick={onUpvote}
        aria-label="Upvote"
        aria-pressed={userVote === 'up'}
      >
        <span className={iconScale[size]} aria-hidden="true">
          &#9650;
        </span>
      </motion.button>
      <span
        className={`text-sm font-bold ${
          score > 0
            ? 'text-orange-600 dark:text-orange-400'
            : score < 0
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400'
        }`}
        aria-label={`Score: ${score}`}
      >
        {formatScore(score)}
      </span>
      <motion.button
        type="button"
        whileTap={{ scale: 1.3 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className={`${sizeClasses[size]} flex items-center justify-center rounded-md transition-colors ${
          userVote === 'down'
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-blue-500'
        }`}
        onClick={onDownvote}
        aria-label="Downvote"
        aria-pressed={userVote === 'down'}
      >
        <span className={iconScale[size]} aria-hidden="true">
          &#9660;
        </span>
      </motion.button>
    </div>
  );
}

function formatScore(score: number): string {
  if (Math.abs(score) >= 1000000) return `${(score / 1000000).toFixed(1)}M`;
  if (Math.abs(score) >= 1000) return `${(score / 1000).toFixed(1)}K`;
  return String(score);
}

export default VoteButtons;
