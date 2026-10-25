import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// QM-FIX — the PR list row previously rendered a hardcoded "Review required"
// chip on EVERY row though no review data existed for list rows. The chip may
// now render only when the list endpoint's real review-requirement verdict
// (target branch protection rule + effective review verdicts) is true.

const baseProps = {
  pullSearchQuery: '',
  setPullSearchQuery: vi.fn(),
  filteredPulls: [] as PRItem[],
  openPullsCount: 1,
  closedPullsCount: 0,
  repoId: 'repo-1',
  currentUsername: 'kundan',
};

function prRow(overrides: Partial<PRItem> = {}): PRItem {
  return {
    id: 101,
    title: 'Fix login crash',
    state: 'open',
    author: 'kundan',
    branchSource: 'fix/login-crash',
    branchTarget: 'main',
    checksStatus: 'unknown',
    commentsCount: 0,
    createdAt: 'just now',
    ...overrides,
  };
}

describe('QuantGit PR list "Review required" chip honesty', () => {
  it('renders the chip only when the real verdict is reviewRequired: true', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} filteredPulls={[prRow({ reviewRequired: true })]} />,
    );

    expect(html).toContain('Fix login crash');
    expect(html).toContain('Review required');
    expect(html).toContain('pr-review-required-101');
  });

  it('renders NO chip when the verdict is false (unprotected branch or satisfied reviews)', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} filteredPulls={[prRow({ reviewRequired: false })]} />,
    );

    expect(html).toContain('Fix login crash');
    expect(html).not.toContain('Review required');
  });

  it('renders NO chip when the verdict is absent (old payloads / unknown data) — never hardcoded', () => {
    const row = prRow();
    delete (row as Partial<PRItem>).reviewRequired;
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} filteredPulls={[row]} />,
    );

    expect(html).toContain('Fix login crash');
    expect(html).not.toContain('Review required');
  });

  it('renders the chip per-row, not for every row', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab
        {...baseProps}
        filteredPulls={[
          prRow({ id: 101, title: 'Needs review', reviewRequired: true }),
          prRow({ id: 102, title: 'Already approved', reviewRequired: false }),
        ]}
      />,
    );

    expect(html).toContain('Needs review');
    expect(html).toContain('Already approved');
    expect(html).toContain('pr-review-required-101');
    expect(html).not.toContain('pr-review-required-102');
    // Exactly one chip in the whole list.
    expect(html.split('Review required').length - 1).toBe(1);
  });
});
