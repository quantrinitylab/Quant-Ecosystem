import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// QM-FIX — QuantGit PR detail "wants to merge" line must never render a blank
// author slot. Regression: the open/closed detail view rendered
// `<strong>{selectedPR.author}</strong> wants to merge` with no fallback, so
// an author-less PR (backend returns ''/undefined for a missing author row)
// showed a leading blank where a name belongs — while the sibling merged
// slots already fell back. The author slot now renders 'Unknown', matching
// the file's honest-unknown convention (reviewer fallback, '—' counts).

const baseProps = {
  pullSearchQuery: '',
  setPullSearchQuery: vi.fn(),
  filteredPulls: [] as PRItem[],
  openPullsCount: 1,
  closedPullsCount: 0,
  repoId: 'repo-1',
  currentUsername: 'kundan',
};

function openPR(author: unknown): PRItem {
  return {
    id: 101,
    title: 'Fix login crash',
    state: 'open',
    author: author as string,
    branchSource: 'fix/login-crash',
    branchTarget: 'main',
    checksStatus: 'unknown',
    commentsCount: null,
    createdAt: 'just now',
  };
}

function detailHtml(author: unknown): string {
  return renderToStaticMarkup(
    <PullRequestsTab {...baseProps} initialSelectedPR={openPR(author)} />,
  );
}

describe('QuantGit PR detail author fallback (wants to merge line)', () => {
  it('renders Unknown when the PR author is an empty string', () => {
    const html = detailHtml('');
    expect(html).toContain('<strong class="text-[#E6EDF3]">Unknown</strong> wants to merge');
    expect(html).not.toContain('<strong class="text-[#E6EDF3]"></strong> wants to merge');
  });

  it('renders Unknown when the PR author is missing (undefined)', () => {
    const html = detailHtml(undefined);
    expect(html).toContain('<strong class="text-[#E6EDF3]">Unknown</strong> wants to merge');
    expect(html).not.toContain('<strong class="text-[#E6EDF3]"></strong> wants to merge');
  });

  it('renders the real author name when one is present', () => {
    const html = detailHtml('kundan');
    expect(html).toContain('<strong class="text-[#E6EDF3]">kundan</strong> wants to merge');
    expect(html).not.toContain('>Unknown</strong> wants to merge');
  });
});
