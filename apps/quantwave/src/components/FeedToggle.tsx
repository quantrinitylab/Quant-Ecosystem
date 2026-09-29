'use client';

// ============================================================================
// QuantSync - FeedToggle Component
// Feed mode switcher (For You / Following / Anonymous / Trending)
// ============================================================================

import { motion } from 'framer-motion';
import type { FeedMode } from '../types';

interface FeedToggleProps {
  activeMode: FeedMode;
  onModeChange: (mode: FeedMode) => void;
}

const FEED_MODES: { mode: FeedMode; label: string; icon: string }[] = [
  { mode: 'for-you', label: 'For You', icon: 'sparkles' },
  { mode: 'following', label: 'Following', icon: 'users' },
  { mode: 'chronological', label: 'Latest', icon: 'clock' },
  { mode: 'anonymous', label: 'Anonymous', icon: 'mask' },
  { mode: 'trending', label: 'Trending', icon: 'fire' },
];

export function FeedToggle({ activeMode, onModeChange }: FeedToggleProps) {
  return (
    <nav
      className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 px-2 overflow-x-auto"
      role="tablist"
      aria-label="Feed mode"
    >
      {FEED_MODES.map(({ mode, label, icon }) => (
        <button
          key={mode}
          className={`relative flex min-h-[44px] items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeMode === mode
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
          role="tab"
          aria-selected={activeMode === mode}
          onClick={() => onModeChange(mode)}
        >
          <span className={`icon icon-${icon}`} aria-hidden="true" />
          <span>{label}</span>
          {activeMode === mode && (
            <motion.div
              layoutId="feed-tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      ))}
    </nav>
  );
}

export default FeedToggle;
