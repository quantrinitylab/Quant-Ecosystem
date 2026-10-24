import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The component imports apiFetchRaw from '@quant/api-client', whose
// proxy.ts imports 'next/server' — but static rendering never runs
// effects, so no fetch ever happens. Mock the client so this suite does
// not depend on the host's Next install.
vi.mock('@quant/api-client', () => ({ apiFetchRaw: vi.fn() }));

import { PullRequestsTab, reviewReviewerName } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// Viewer-leakage regression (same family fixed for commit authors in
// PR #1417): PullRequestsTab used to map an unknown reviewer as
// `r.reviewer?.username || r.reviewer?.displayName || currentUsername ||
// 'Unknown'` and render merged PRs as `Merged by {selectedPR.author ||
// currentUsername}` — so every unknown reviewer or merger was presented
// as whoever happened to be viewing the PR. The mapper now degrades to
// '' and the render sites show 'Unknown'; the viewer is never substituted.

const VIEWER = 'viewername';

const baseProps = {
  pullSearchQuery: '',
  setPullSearchQuery: vi.fn(),
  filteredPulls: [] as PRItem[],
  openPullsCount: 1,
  closedPullsCount: 0,
  repoId: 'repo-1',
  currentUsername: VIEWER,
};

function mergedPR(author: string): PRItem {
  return {
    id: 42,
    title: 'Fix login crash',
    state: 'merged',
    author,
    branchSource: 'fix/login-crash',
    branchTarget: 'main',
    checksStatus: 'unknown',
    commentsCount: null,
    createdAt: 'just now',
  };
}

function srcPath(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

describe('reviewReviewerName — never substitutes the viewer', () => {
  it('prefers username, then displayName', () => {
    expect(reviewReviewerName({ username: 'alice', displayName: 'Alice A' })).toBe('alice');
    expect(reviewReviewerName({ username: '', displayName: 'Alice A' })).toBe('Alice A');
  });

  it('degrades an unknown reviewer to an honest empty string, never the viewer', () => {
    expect(reviewReviewerName(null)).toBe('');
    expect(reviewReviewerName(undefined)).toBe('');
    expect(reviewReviewerName({})).toBe('');
    expect(reviewReviewerName({ username: '', displayName: '' })).toBe('');
  });
});

describe('merged PR detail — unknown merger renders Unknown, never the viewer', () => {
  it('renders Merged by Unknown in both merged slots when the author is unknown', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} initialSelectedPR={mergedPR('')} />,
    );

    expect(html).toContain('data-testid="pr-merged-info"');
    expect(html).toContain('data-testid="merged-status-banner"');
    expect(html).toContain('Merged by');
    expect(html).toContain('Unknown');
    // The viewer must not appear anywhere in the rendered detail.
    expect(html).not.toContain(VIEWER);
  });

  it('still renders the real author verbatim when known', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} initialSelectedPR={mergedPR('alice')} />,
    );

    expect(html).toContain('alice');
    expect(html).not.toContain(VIEWER);
  });
});

describe('source regression — no viewer fallback in reviewer/merger slots', () => {
  it('PullRequestsTab source carries no currentUsername fallback for reviewers or mergers', () => {
    const src = readFileSync(srcPath('../components/PullRequestsTab.tsx'), 'utf8');

    expect(src).not.toContain('selectedPR.author || currentUsername');
    expect(src).not.toContain("|| currentUsername || 'Unknown'");
  });
});
