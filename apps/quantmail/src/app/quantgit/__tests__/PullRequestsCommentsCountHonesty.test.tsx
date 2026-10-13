import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// QM-FIX — QuantGit must never invent PR comment counts.
// Regression: the PR endpoints hardcoded commentsCount: 0, so PRs with real
// review comments displayed "0 comments". The backend now returns the real
// count from the review_comments table (or null when the count source is
// unavailable); the row must render the real number, or '—' — never an
// invented 0.

const baseProps = {
  pullSearchQuery: '',
  setPullSearchQuery: vi.fn(),
  filteredPulls: [] as PRItem[],
  openPullsCount: 1,
  closedPullsCount: 0,
  repoId: 'repo-1',
  currentUsername: 'kundan',
};

function prWithComments(commentsCount: number | null): PRItem {
  return {
    id: 101,
    title: 'Fix login crash',
    state: 'open',
    author: 'kundan',
    branchSource: 'fix/login-crash',
    branchTarget: 'main',
    checksStatus: 'unknown',
    commentsCount,
    createdAt: 'just now',
  };
}

describe('QuantGit PR commentsCount honesty (no invented zeros)', () => {
  it('PR list row renders the real comment count when the API provides it', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} filteredPulls={[prWithComments(3)]} />,
    );

    expect(html).toContain('Fix login crash');
    // The comment badge renders the real count verbatim.
    expect(html).toContain('<span class="text-xs">3</span>');
  });

  it('PR list row renders — when the count is unknown — never an invented 0', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} filteredPulls={[prWithComments(null)]} />,
    );

    expect(html).toContain('Fix login crash');
    // Unknown is surfaced honestly as '—', matching the diff-stats convention.
    expect(html).toContain('<span class="text-xs">—</span>');
    // The comment badge must never render an invented 0 for unknown counts.
    expect(html).not.toContain('<span class="text-xs">0</span>');
  });

  it('PR list row renders a genuine 0 when the API reports the PR truly has no comments', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} filteredPulls={[prWithComments(0)]} />,
    );

    expect(html).toContain('<span class="text-xs">0</span>');
  });
});
