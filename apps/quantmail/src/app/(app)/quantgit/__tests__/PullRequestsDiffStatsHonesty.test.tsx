import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// QM-FIX — QuantGit must never invent PR diff stats.
// Regression: the list/create endpoints report null (unknown) stats and the
// frontend previously rendered fabricated +12/-2 (mappings) and +24/-5 (rows).

const baseProps = {
  pullSearchQuery: '',
  setPullSearchQuery: vi.fn(),
  filteredPulls: [] as PRItem[],
  openPullsCount: 0,
  closedPullsCount: 0,
  repoId: 'repo-1',
  currentUsername: 'kundan',
};

function prWithoutStats(): PRItem {
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
    // additions/deletions/changedFiles intentionally absent (unknown)
  };
}

describe('QuantGit PR diff stats honesty (no invented counts)', () => {
  it('PR list row omits the stats segment when stats are unknown — never +24/-5', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} filteredPulls={[prWithoutStats()]} />,
    );

    expect(html).toContain('Fix login crash');
    // The previously invented row fallbacks must never appear.
    expect(html).not.toContain('>+24<');
    expect(html).not.toContain('>-5<');
    // The whole "· +N -M" stats segment is hidden when unknown.
    expect(html).not.toContain('· +');
  });

  it('PR list row renders real stats when the API provides them', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab
        {...baseProps}
        filteredPulls={[{ ...prWithoutStats(), additions: 18, deletions: 4 }]}
      />,
    );

    expect(html).toContain('+18');
    expect(html).toContain('-4');
    expect(html).not.toContain('>+24<');
  });

  it('PR detail header shows — when stats are unknown — never +24/-5', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} initialSelectedPR={prWithoutStats()} />,
    );

    expect(html).toContain('+—');
    expect(html).toContain('-—');
    expect(html).not.toContain('>+24<');
    expect(html).not.toContain('>-5<');
    // Files changed is honest about the unknown too.
    expect(html).toContain('Files changed (—)');
    // Unknown file count is "not available", not "no files changed".
    expect(html).toContain('Diff preview is not available for this pull request yet.');
    expect(html).not.toContain('No files changed in this pull request.');
  });

  it('PR detail header renders real stats when known', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab
        {...baseProps}
        initialSelectedPR={{ ...prWithoutStats(), additions: 42, deletions: 7, changedFiles: 3 }}
      />,
    );

    expect(html).toContain('+42');
    expect(html).toContain('-7');
    expect(html).toContain('Files changed (3)');
    expect(html).not.toContain('+—');
  });

  it('PR detail with a real measured zero shows "No files changed"', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab
        {...baseProps}
        initialSelectedPR={{ ...prWithoutStats(), additions: 0, deletions: 0, changedFiles: 0 }}
      />,
    );

    expect(html).toContain('+0');
    expect(html).toContain('-0');
    expect(html).toContain('No files changed in this pull request.');
  });
});
