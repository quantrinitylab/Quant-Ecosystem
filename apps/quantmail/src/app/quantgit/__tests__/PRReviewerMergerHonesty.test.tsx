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

import { PullRequestsTab, reviewReviewerName, prMergerName } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// Viewer-leakage regression (same family fixed for commit authors in
// PR #1417): PullRequestsTab used to map an unknown reviewer as
// `r.reviewer?.username || r.reviewer?.displayName || currentUsername ||
// 'Unknown'` and render merged PRs as `Merged by {selectedPR.author ||
// currentUsername}` — so every unknown reviewer or merger was presented
// as whoever happened to be viewing the PR. The mapper now degrades to
// '' and the render sites show 'Unknown'; the viewer is never substituted.
//
// CORRECTION (CODEX DO NOT MERGE on this PR): the first fix replaced the
// viewer fallback with the AUTHOR (`selectedPR.author || 'Unknown'`), which
// is a second misattribution — the author opened the PR, the merger closed
// it. Merger rendering now reads ONLY `selectedPR.mergedBy` (real backend
// data when present, null today because the backend records no merger on
// the PR row); a missing merged-by renders 'Unknown', never the author.

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

function mergedPR(author: string, mergedBy?: string | null): PRItem {
  return {
    id: 42,
    title: 'Fix login crash',
    state: 'merged',
    author,
    mergedBy: mergedBy ?? null,
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

describe('prMergerName — reads only mergedBy, never the author', () => {
  it('returns the real merger verbatim (trimmed)', () => {
    expect(prMergerName({ mergedBy: 'bob' })).toBe('bob');
    expect(prMergerName({ mergedBy: '  bob  ' })).toBe('bob');
  });

  it('degrades a missing merged-by to an honest empty string, never the author', () => {
    expect(prMergerName(null)).toBe('');
    expect(prMergerName(undefined)).toBe('');
    expect(prMergerName({})).toBe('');
    expect(prMergerName({ mergedBy: null })).toBe('');
    expect(prMergerName({ mergedBy: '' })).toBe('');
    expect(prMergerName({ mergedBy: '   ' })).toBe('');
  });
});

describe('merged PR detail — merger attribution (author ≠ merger ≠ viewer)', () => {
  it('author ≠ merger: both merged slots render the merger, never the author', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} initialSelectedPR={mergedPR('alice', 'bob')} />,
    );

    expect(html).toContain('data-testid="pr-merged-info"');
    expect(html).toContain('data-testid="merged-status-banner"');
    // Exactly two "Merged by" claims (header slot + banner), one name each.
    expect(html.split('Merged by').length - 1).toBe(2);
    expect(html).toContain('Merged by bob into');
    expect(html).toContain('>bob<');
    // The author must not appear anywhere in the merged detail: nothing
    // here may present alice as (or beside) the merger.
    expect(html).not.toContain('alice');
    expect(html).not.toContain(VIEWER);
  });

  it('author == merger: renders the single shared name once per slot, no duplication', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps} initialSelectedPR={mergedPR('alice', 'alice')} />,
    );

    expect(html).toContain('data-testid="pr-merged-info"');
    expect(html).toContain('data-testid="merged-status-banner"');
    expect(html.split('Merged by').length - 1).toBe(2);
    expect(html).toContain('Merged by alice into');
    expect(html).toContain('>alice<');
    // One occurrence per slot — no "alice (alice)", no doubled name.
    expect(html.split('alice').length - 1).toBe(2);
    expect(html).not.toContain(VIEWER);
  });

  it.each([undefined, null, ''])(
    'missing merged-by (%s): both merged slots render Unknown, never the author',
    (mergedBy) => {
      const html = renderToStaticMarkup(
        <PullRequestsTab {...baseProps} initialSelectedPR={mergedPR('alice', mergedBy)} />,
      );

      expect(html).toContain('data-testid="pr-merged-info"');
      expect(html).toContain('data-testid="merged-status-banner"');
      expect(html).toContain('Merged by Unknown into');
      expect(html).toContain('>Unknown<');
      // The known author must NOT be substituted for the unknown merger,
      // and neither must the viewer.
      expect(html).not.toContain('alice');
      expect(html).not.toContain(VIEWER);
    },
  );
});

describe('source regression — no viewer/author fallback in reviewer/merger slots', () => {
  it('PullRequestsTab source carries no currentUsername or author fallback for reviewers or mergers', () => {
    const src = readFileSync(srcPath('../components/PullRequestsTab.tsx'), 'utf8');

    expect(src).not.toContain('selectedPR.author || currentUsername');
    expect(src).not.toContain("|| currentUsername || 'Unknown'");
    // The old author-as-merger fallback must be gone from both merged slots.
    expect(src).not.toContain("Merged by {selectedPR.author");
    expect(src).not.toContain("selectedPR.author || 'Unknown'");
    // Both merged slots render through the mergedBy-only helper.
    expect(src.split("prMergerName(selectedPR) || 'Unknown'").length - 1).toBe(2);
  });
});
