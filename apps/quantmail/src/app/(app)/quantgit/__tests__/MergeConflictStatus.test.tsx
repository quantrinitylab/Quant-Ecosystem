import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab, MergeConflictStatus } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

/**
 * Regression proof for the merge-box false-conflict-claim finding:
 * the QuantGit merge box must NEVER render "This branch has no conflicts with
 * the base branch." from client-side guesswork. That sentence may appear ONLY
 * in the `mergeable` state, which the component sets from a real backend
 * dry-run (GET /:id/pulls/:number/mergeable).
 */

const MOCK_PR: PRItem = {
  id: 301,
  title: 'fix: honest merge reporting',
  state: 'open',
  author: 'tester',
  branchSource: 'fix/honest-merge',
  branchTarget: 'main',
  checksStatus: 'unknown',
  commentsCount: 0,
  createdAt: '1 minute ago',
  additions: 3,
  deletions: 1,
  changedFiles: 1,
};

const NO_CONFLICT_CLAIM = 'This branch has no conflicts with the base branch.';

function renderPRDetail() {
  // renderToStaticMarkup does not run effects, so the mergeable fetch never
  // fires: this is exactly the first-paint state a user sees.
  return renderToStaticMarkup(
    <PullRequestsTab
      pullSearchQuery=""
      setPullSearchQuery={vi.fn()}
      filteredPulls={[MOCK_PR]}
      openPullsCount={1}
      closedPullsCount={0}
      initialSelectedPR={MOCK_PR}
    />,
  );
}

describe('merge box — no unverified no-conflict claim', () => {
  it('first paint shows "Checking for merge conflicts…" instead of the claim', () => {
    const html = renderPRDetail();
    expect(html).toContain('merge-box-container');
    expect(html).toContain('Checking for merge conflicts…');
    expect(html).not.toContain(NO_CONFLICT_CLAIM);
  });
});

describe('MergeConflictStatus — every state is honest', () => {
  it('checking: says it is checking, claims nothing', () => {
    const html = renderToStaticMarkup(<MergeConflictStatus check={{ status: 'checking' }} />);
    expect(html).toContain('Checking for merge conflicts…');
    expect(html).not.toContain(NO_CONFLICT_CLAIM);
  });

  it('mergeable: the claim appears ONLY here (backend verified)', () => {
    const html = renderToStaticMarkup(<MergeConflictStatus check={{ status: 'mergeable' }} />);
    expect(html).toContain(NO_CONFLICT_CLAIM);
  });

  it('conflict: names the problem and lists the conflicted files', () => {
    const html = renderToStaticMarkup(
      <MergeConflictStatus
        check={{ status: 'conflict', conflicts: ['src/a.ts', 'src/b.ts'] }}
      />,
    );
    expect(html).toContain('has conflicts with the base branch');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('src/b.ts');
    expect(html).not.toContain(NO_CONFLICT_CLAIM);
  });

  it('unknown: admits the check is unavailable, claims neither outcome', () => {
    const html = renderToStaticMarkup(<MergeConflictStatus check={{ status: 'unknown' }} />);
    expect(html).toContain('Merge-conflict status is unknown');
    expect(html).toContain('neither a pass nor a failure');
    expect(html).not.toContain(NO_CONFLICT_CLAIM);
  });
});
