import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// Regression tests for fix/qm-quantgit-invented-author: a missing PR author
// must render as 'Unknown' — never as the invented string 'user', and never
// as the viewing user's own username (which would falsely attribute the
// merge/open to whoever happens to be looking at the page).

const MERGED_PR_WITHOUT_AUTHOR: PRItem = {
  id: 202,
  title: 'fix(engine): resolve branch protection mutex race condition',
  state: 'merged',
  author: null,
  branchSource: 'fix/mutex-race',
  branchTarget: 'main',
  checksStatus: 'passing',
  commentsCount: 4,
  createdAt: '1 hour ago',
  additions: 19,
  deletions: 3,
  changedFiles: 1,
};

const OPEN_PR_WITHOUT_AUTHOR: PRItem = {
  id: 203,
  title: 'feat: honest author rendering',
  state: 'open',
  author: null,
  branchSource: 'feat/honest-author',
  branchTarget: 'main',
  checksStatus: 'unknown',
  commentsCount: 0,
  createdAt: 'Just now',
};

function renderSelected(pr: PRItem, currentUsername: string) {
  return renderToStaticMarkup(
    <PullRequestsTab
      pullSearchQuery=""
      setPullSearchQuery={vi.fn()}
      filteredPulls={[pr]}
      openPullsCount={pr.state === 'open' ? 1 : 0}
      closedPullsCount={pr.state === 'merged' ? 1 : 0}
      currentUsername={currentUsername}
      initialSelectedPR={pr}
    />,
  );
}

describe('QuantGit invented-author fallbacks (frontend)', () => {
  it('merged PR with unknown author renders "Merged by Unknown", never the viewer', () => {
    const html = renderSelected(MERGED_PR_WITHOUT_AUTHOR, 'viewer-user');
    expect(html).toContain('data-testid="pr-merged-info"');
    expect(html).toContain('Merged by');
    expect(html).toContain('Unknown');
    expect(html).not.toContain('viewer-user');
    expect(html).toContain('data-testid="merged-status-banner"');
    expect(html).toContain('Merged by Unknown into main.');
  });

  it('open PR with unknown author renders "Unknown wants to merge"', () => {
    const html = renderSelected(OPEN_PR_WITHOUT_AUTHOR, 'viewer-user');
    expect(html).toContain('Unknown');
    expect(html).toContain('wants to merge');
    expect(html).not.toContain('viewer-user');
  });

  it('PR list row with unknown author renders "by Unknown"', () => {
    // No initialSelectedPR: the tab renders the list view, not the detail view.
    const html = renderToStaticMarkup(
      <PullRequestsTab
        pullSearchQuery=""
        setPullSearchQuery={vi.fn()}
        filteredPulls={[OPEN_PR_WITHOUT_AUTHOR]}
        openPullsCount={1}
        closedPullsCount={0}
        currentUsername="viewer-user"
      />,
    );
    expect(html).toContain('by Unknown');
    expect(html).not.toContain('viewer-user');
  });
});
