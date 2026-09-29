'use client';
// ============================================================================
// QuantSync - SpaceTabs
// ============================================================================
//
// Top-level switcher between the three QuantSync feed spaces:
//   Main       — the normal feed
//   Verified   — "QuantSync Verified": everyone can read, only verified accounts
//                can post/reply (shows the verified badge)
//   Anonymous  — identity-hidden feed (+ anonymous reels), moderated
//
// Presentational only; the active space is owned by the page so it can drive
// feed loading + compose gating (via FeedSpaceService). Accessible as a tablist.

import React from 'react';
import type { FeedSpace } from '../services/feed-space-rules';

export interface SpaceTabsProps {
  active: FeedSpace;
  onChange: (space: FeedSpace) => void;
  className?: string;
}

const SPACES: { id: FeedSpace; label: string; icon: string }[] = [
  { id: 'main', label: 'Main', icon: '\uD83C\uDFE0' }, // house
  { id: 'verified', label: 'Verified', icon: '\u2713' }, // check
  { id: 'anonymous', label: 'Anonymous', icon: '\uD83C\uDFAD' }, // masks
];

export const SpaceTabs: React.FC<SpaceTabsProps> = ({ active, onChange, className = '' }) => {
  return (
    <div
      role="tablist"
      aria-label="QuantSync feed spaces"
      data-testid="space-tabs"
      className={`flex gap-1 mb-4 p-1 rounded-lg bg-[var(--quant-muted)] ${className}`}
    >
      {SPACES.map((space) => {
        const isActive = active === space.id;
        return (
          <button
            key={space.id}
            role="tab"
            aria-selected={isActive}
            data-testid={`space-tab-${space.id}`}
            onClick={() => onChange(space.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
              isActive
                ? 'bg-[var(--quant-background)] text-[var(--quant-foreground)] shadow-sm'
                : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
            }`}
          >
            <span
              aria-hidden="true"
              className={space.id === 'verified' ? 'text-blue-500 font-bold' : ''}
            >
              {space.icon}
            </span>
            <span>{space.id === 'verified' ? 'QuantSync Verified' : space.label}</span>
          </button>
        );
      })}
    </div>
  );
};

SpaceTabs.displayName = 'SpaceTabs';
