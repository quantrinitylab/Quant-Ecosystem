import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantGitSubViews,
  type RepositoryItem,
  type PullRequestItem,
  type IssueTrackItem,
  type WorkflowRun,
} from '../components/QuantGitSubViews';

// QM-SCREEN-013 R3 P1 — the landing tabs (repos / prs / issues / actions) must
// render the REAL fetched data wired through as props, keep honest empty
// states when genuinely empty, and never fabricate badges (priority, status).

const repo: RepositoryItem = {
  id: 'repo-1',
  name: 'real-repo',
  fullName: 'kundan/real-repo',
  description: 'A real fetched repo',
  language: 'TypeScript',
  languageColor: '#3178C6',
  stars: 3,
  forks: 1,
  branches: [{ name: 'main', isProtected: false }],
  defaultBranch: 'main',
  isPrivate: true,
  updatedAt: '2026-10-12',
};

const pr: PullRequestItem = {
  id: '101',
  prNumber: 101,
  title: 'Fix login crash',
  author: 'kundan',
  sourceBranch: 'fix/login',
  targetBranch: 'main',
  status: 'ci_passing',
  statusText: 'CI passing',
  diffStats: { additions: 10, deletions: 2, filesChanged: 3 },
  labels: [],
  createdAt: '2 hours ago',
};

const issue: IssueTrackItem = {
  id: '7',
  issueNumber: 7,
  title: 'Real issue from the backend',
  // No priority — the backend Issue model has no priority field, so none
  // must be rendered.
  labels: ['bug'],
  state: 'open',
  author: 'kundan',
  createdAt: 'yesterday',
  commentsCount: 2,
};

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    name: 'CI',
    branch: 'main',
    status: 'success',
    duration: '2m 10s',
    commitSha: 'abc1234',
    author: 'kundan',
    triggerEvent: 'push',
    jobs: [{ id: 'j1', name: 'build', status: 'pass', duration: '1m' }],
    createdAt: 'today',
    ...overrides,
  };
}

describe('QM-SCREEN-013 R3 P1: landing tabs render real wired data', () => {
  it('repos tab shows the real repo instead of the permanent empty state', () => {
    const html = renderToStaticMarkup(
      <QuantGitSubViews activeTab="repos" repos={[repo]} />,
    );
    expect(html).toContain('real-repo');
    expect(html).not.toContain('No repositories yet');
  });

  it('repos tab keeps the honest empty state when there really are no repos', () => {
    const html = renderToStaticMarkup(
      <QuantGitSubViews activeTab="repos" repos={[]} />,
    );
    expect(html).toContain('No repositories yet');
  });

  it('prs tab shows the real pull request', () => {
    const html = renderToStaticMarkup(
      <QuantGitSubViews activeTab="prs" prs={[pr]} />,
    );
    expect(html).toContain('PR #101: Fix login crash');
    expect(html).not.toContain('No pull requests yet');
  });

  it('issues tab shows the real issue without a fabricated priority badge', () => {
    const html = renderToStaticMarkup(
      <QuantGitSubViews activeTab="issues" issues={[issue]} />,
    );
    expect(html).toContain('Issue #7: Real issue from the backend');
    expect(html).not.toContain('P0 Critical');
    expect(html).not.toContain('P1 High');
    expect(html).not.toContain('P2 Medium');
    expect(html).not.toContain('P3 Low');
  });

  it('actions tab shows the real pipeline run', () => {
    const html = renderToStaticMarkup(
      <QuantGitSubViews activeTab="actions" workflows={[run()]} />,
    );
    expect(html).toContain('commit abc1234');
    expect(html).not.toContain('No pipeline runs yet');
  });

  it('actions tab never claims ALL GATES PASSING for a failed run', () => {
    const html = renderToStaticMarkup(
      <QuantGitSubViews
        activeTab="actions"
        workflows={[run({ status: 'failed', jobs: [{ id: 'j1', name: 'build', status: 'fail', duration: '1m' }] })]}
      />,
    );
    expect(html).not.toContain('ALL GATES PASSING');
    expect(html).toContain('GATES FAILING');
    expect(html).toContain('Failed');
  });

  it('actions tab keeps the honest empty state when there are no runs', () => {
    const html = renderToStaticMarkup(
      <QuantGitSubViews activeTab="actions" workflows={[]} />,
    );
    expect(html).toContain('No pipeline runs yet');
  });
});
