'use client';

// ============================================================================
// QuantGit — Shared SVG icon set (GitHub Octicon-style, stroke/fill geometric)
// Replaces emoji glyphs (🟢🔴🟡💬✓✕☉⑂) across QuantGit tabs for a proper
// GitHub-grade look. All icons inherit `currentColor` — set GitHub colors
// via text-[#3FB950] (green), text-[#F85149] (red), text-[#D29922] (amber),
// text-[#8957E5] (purple), text-[#8D96A0] (muted).
// ============================================================================

import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

function baseProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    className,
    'aria-hidden': true as const,
  };
}

/** GitHub PR glyph (feather git-pull-request style), currentColor stroke. */
export function QuantGitPRIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="13" r="2.4" />
      <circle cx="4.5" cy="4.5" r="2.4" />
      <path d="M10.5 4.5h1.6a2 2 0 0 1 2 2v4.1" />
      <path d="M4.5 6.9v4.7" />
    </svg>
  );
}

/** Open-issue glyph: ring with center dot (GitHub issue-opened style). */
export function QuantGitIssueOpenIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="8" r="6.4" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Closed-issue glyph: filled circle with check. */
export function QuantGitIssueClosedIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M5.4 8.3l1.9 1.9 3.3-3.9"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Passed check: filled circle with white check (#3FB950 via text color). */
export function QuantGitCheckCircleIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M5.4 8.3l1.9 1.9 3.3-3.9"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Failed check: filled circle with white X (#F85149 via text color). */
export function QuantGitXCircleIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M6 6l4 4M10 6l-4 4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pending check: filled dot (#D29922 via text color). */
export function QuantGitPendingDotIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="8" cy="8" r="6" fill="currentColor" />
    </svg>
  );
}

/** Comment glyph: speech bubble, currentColor fill. */
export function QuantGitCommentIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path
        d="M2.2 2.8h11.6a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H6.4l-2.9 2.9v-2.9H2.2a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Small inline check (for badges/pills), currentColor stroke. */
export function QuantGitCheckIcon({ className, size = 12 }: IconProps) {
  return (
    <svg {...baseProps(size, className)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.2 3.2L13 5" />
    </svg>
  );
}

/** Small inline X (for badges/pills), currentColor stroke. */
export function QuantGitXIcon({ className, size = 12 }: IconProps) {
  return (
    <svg {...baseProps(size, className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

/** Link glyph (for markdown toolbar), currentColor stroke. */
export function QuantGitLinkIcon({ className, size = 14 }: IconProps) {
  return (
    <svg {...baseProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 1 0-4.2-4.2l-1 1" />
      <path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 1 0 4.2 4.2l1-1" />
    </svg>
  );
}

/** Warning triangle (for inline warnings), currentColor stroke. */
export function QuantGitWarningIcon({ className, size = 14 }: IconProps) {
  return (
    <svg {...baseProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5L14.5 13.5H1.5L8 2.5Z" />
      <path d="M8 6.5v3" />
      <circle cx="8" cy="11.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
