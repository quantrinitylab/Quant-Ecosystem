// Issue/PR author + recency honesty regression suite.
//
// The QuantGit Issues and Pull Requests surfaces mapped backend rows with
// `author: item.author || 'user'` and `createdAt: item.createdAt ||
// 'recently'` (page.tsx), while the backend itself sent
// `author: X.author?.username ?? 'user'` (backend/routes/repos.ts, six
// endpoints). Every author-less issue/PR was misattributed to a fabricated
// 'user' identity, and every dateless row claimed a fabricated 'recently'
// recency — the same invented-data defect family as the branches tab's
// 'Update branch' fallback (mapBackendBranch.ts) and the commits tab's
// 'Commit update' fallback (PR #1417).
//
// Established convention (same as the sibling fixes): the mappers degrade to
// honest empty strings; the UI renders its own honest 'Unknown' author
// fallback (BranchesTab convention) and simply omits the date slot instead
// of inventing one.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IssuesTab } from '../components/IssuesTab';
import { PullRequestsTab } from '../components/PullRequestsTab';
import type { IssueItem, PRItem } from '../types';

const QUANTGIT_DIR = path.resolve(__dirname, '..');

function readSource(rel: string): string {
  return readFileSync(path.join(QUANTGIT_DIR, rel), 'utf8');
}

describe('no invented author/recency fallbacks in source', () => {
  it('page.tsx never invents an issue/PR author or recency', () => {
    const src = readSource('page.tsx');
    expect(src).not.toContain("item.author || 'user'");
    expect(src).not.toContain("item.createdAt || 'recently'");
  });

  it('backend never invents an issue/PR author identity', () => {
    const src = readSource('../../../backend/routes/repos.ts');
    expect(src).not.toContain("?? 'user'");
  });
});

const AUTHORLESS_ISSUE: IssueItem = {
  id: 7,
  title: 'Authorless issue',
  state: 'open',
  // What the fixed mapper emits when the backend provides no author/date:
  author: '',
  labels: [],
  commentsCount: 0,
  createdAt: '',
  body: 'Body',
  assignee: 'Unassigned',
};

const REAL_ISSUE: IssueItem = {
  ...AUTHORLESS_ISSUE,
  id: 8,
  title: 'Real issue',
  author: 'devone',
  createdAt: 'Oct 20, 2026',
};

function issuesTabProps(issues: IssueItem[]) {
  return {
    issueSearchQuery: '',
    setIssueSearchQuery: () => {},
    filteredIssues: issues,
    allIssues: issues,
    openIssuesCount: issues.length,
    closedIssuesCount: 0,
    setModalState: () => {},
    openIssueDetail: () => {},
    handleToggleIssue: () => {},
    onCreateIssue: async () => ({ ok: true as const }),
    onPostIssueComment: async () => ({ ok: true as const }),
  };
}

describe('IssuesTab — honest author/recency rendering', () => {
  it('renders an authorless/dateless issue with an honest Unknown fallback and no invented text', () => {
    const html = renderToStaticMarkup(<IssuesTab {...(issuesTabProps([AUTHORLESS_ISSUE]) as never)} />);
    expect(html).toContain('Unknown');
    expect(html).not.toContain('by user');
    expect(html).not.toContain('recently');
    // The "#7" row must not read "#7 opened recently by user".
    expect(html).not.toMatch(/opened recently/);
  });

  it('passes real author/date through verbatim', () => {
    const html = renderToStaticMarkup(<IssuesTab {...(issuesTabProps([REAL_ISSUE]) as never)} />);
    expect(html).toContain('devone');
    expect(html).toContain('Oct 20, 2026');
  });
});

const AUTHORLESS_PR: PRItem = {
  id: 3,
  title: 'Authorless PR',
  state: 'open',
  // What the fixed mapper emits when the backend provides no author/date:
  author: '',
  branchSource: 'feature/x',
  branchTarget: 'main',
  checksStatus: 'unknown',
  commentsCount: null,
  createdAt: '',
  body: 'Body',
};

const REAL_PR: PRItem = {
  ...AUTHORLESS_PR,
  id: 4,
  title: 'Real PR',
  author: 'devtwo',
  createdAt: 'Oct 19, 2026',
};

function prsTabProps(prs: PRItem[], initialSelectedPR: PRItem | null = null) {
  return {
    pullSearchQuery: '',
    setPullSearchQuery: () => {},
    filteredPulls: prs,
    openPullsCount: prs.length,
    closedPullsCount: 0,
    setModalState: () => {},
    openPullDetail: () => {},
    showToast: () => {},
    initialSelectedPR,
  };
}

describe('PullRequestsTab — honest author/recency rendering', () => {
  it('renders an authorless/dateless PR row with an honest Unknown fallback and no invented text', () => {
    const html = renderToStaticMarkup(<PullRequestsTab {...(prsTabProps([AUTHORLESS_PR]) as never)} />);
    expect(html).toContain('Unknown');
    expect(html).not.toContain('recently');
    expect(html).not.toMatch(/by user/);
  });

  it('renders an authorless PR detail with an honest Unknown fallback', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...(prsTabProps([AUTHORLESS_PR], AUTHORLESS_PR) as never)} />,
    );
    expect(html).toContain('Unknown');
    expect(html).toContain('wants to merge');
    expect(html).not.toContain('recently');
  });

  it('passes real author/date through verbatim', () => {
    const html = renderToStaticMarkup(<PullRequestsTab {...(prsTabProps([REAL_PR]) as never)} />);
    expect(html).toContain('devtwo');
    expect(html).toContain('Oct 19, 2026');
  });
});
