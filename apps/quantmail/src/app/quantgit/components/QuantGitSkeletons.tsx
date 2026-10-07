'use client';

// ============================================================================
// QuantGit — Shared loading skeletons + empty states for list tabs.
// Skeleton rows mirror the PR/Issue row layout (icon + title + meta + count)
// so the transition from loading -> content doesn't jump.
// ============================================================================

import React from 'react';
import { QuantGitIssueOpenIcon, QuantGitPRIcon } from './QuantGitIcons';

export interface QuantGitRowSkeletonProps {
  /** Number of skeleton rows to render. */
  rows?: number;
  testId?: string;
}

/** Pulsing skeleton rows matching the PR/Issue list row layout. */
export function QuantGitRowSkeleton({ rows = 5, testId = 'quantgit-row-skeleton' }: QuantGitRowSkeletonProps) {
  return (
    <div data-testid={testId} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="p-4 flex items-start justify-between gap-4 border-b border-[#21262D] last:border-b-0"
        >
          <div className="flex-1 space-y-2 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#21262D]" />
              <div className="h-4 w-2/5 rounded bg-[#21262D]" />
              <div className="h-4 w-16 rounded bg-[#21262D]" />
            </div>
            <div className="h-3 w-3/5 rounded bg-[#21262D]" />
          </div>
          <div className="w-10 h-4 rounded bg-[#21262D] animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

export interface QuantGitEmptyStateProps {
  icon: 'pr' | 'issue' | 'agent';
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
}

/** GitHub-style empty state: icon + headline + nudge + optional CTA. */
export function QuantGitEmptyState({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
  testId = 'quantgit-empty-state',
}: QuantGitEmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center text-center px-6 py-14 space-y-3"
    >
      <div className="w-12 h-12 rounded-full bg-[#21262D] border border-[#30363D] flex items-center justify-center text-[#8D96A0]">
        {icon === 'pr' ? (
          <QuantGitPRIcon size={24} />
        ) : icon === 'issue' ? (
          <QuantGitIssueOpenIcon size={24} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="10" height="7" rx="2" />
            <path d="M6 5V3.5A1.5 1.5 0 0 1 7.5 2h1A1.5 1.5 0 0 1 10 3.5V5" />
            <circle cx="6.2" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="9.8" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
            <path d="M8 12v2" />
          </svg>
        )}
      </div>
      <h3 className="text-sm font-bold text-[#E6EDF3]">{title}</h3>
      <p className="text-xs text-[#8D96A0] max-w-sm">{hint}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 px-4 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
