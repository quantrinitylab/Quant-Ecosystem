import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InsightsTab, computeRepoInsights } from '../components/InsightsTab';
import type { CommitItem, PRItem, WorkflowRunItem } from '../types';

// QM-UIUX-066 — QuantGit's InsightsTab must never fabricate repository
// stats. Regression: the whole tab was hardcoded — "48 Commits",
// "2 Pull Requests / Merged without regression", "100% CI Health",
// "11 GitHub Actions workflows green" and a fake 7-bar chart with values
// [12, 18, 24, 45, 60, 32, 48] — while taking zero props. Every number is
// now computed from the real commits / pull requests / workflow runs the
// page already fetched, and anything without a real source renders an
// explicit unknown state instead of an invented figure.

const FABRICATED_STRINGS = [
  '48 Commits',
  '100% CI Health',
  '11 GitHub Actions workflows green',
  'Pushed to main in the last week',
  'Merged without regression',
  'Day 1',
  'Day 7',
];

function dateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function makeCommit(sha: string, daysAgo: number): CommitItem {
  return {
    sha,
    message: `commit ${sha}`,
    author: { name: 'Dev One' },
    date: dateDaysAgo(daysAgo),
    relativeTime: 'recently',
    verified: false,
  };
}

function makePr(id: number, state: PRItem['state']): PRItem {
  return {
    id,
    title: `PR ${id}`,
    state,
    author: 'teammate',
    branchSource: 'feature',
    branchTarget: 'main',
    checksStatus: 'unknown',
    commentsCount: 0,
    createdAt: 'Oct 1, 2026',
  };
}

function makeRun(id: number, status: WorkflowRunItem['status'], workflow = 'CI'): WorkflowRunItem {
  return {
    id,
    name: workflow,
    workflow,
    status,
    branch: 'main',
    event: 'push',
    commitSha: 'abc1234',
    duration: '1m',
    timeAgo: '1h',
    jobs: [],
  };
}

describe('QM-UIUX-066: InsightsTab with no data supplied', () => {
  it('renders the honest empty state and invents no stats or chart', () => {
    const html = renderToStaticMarkup(<InsightsTab />);

    expect(html).toContain('No insights available');
    expect(html).toContain('There is no repository activity data to summarize yet.');
    for (const fabricated of FABRICATED_STRINGS) {
      expect(html).not.toContain(fabricated);
    }
    // No fake bar chart either.
    expect(html).not.toContain('Commit Frequency');
  });
});

describe('QM-UIUX-066: computeRepoInsights derives everything from real data', () => {
  it('counts commits and pull requests by their real states', () => {
    const insights = computeRepoInsights({
      commits: [makeCommit('a1', 0), makeCommit('a2', 0), makeCommit('a3', 2)],
      pullRequests: [makePr(1, 'merged'), makePr(2, 'merged'), makePr(3, 'open'), makePr(4, 'closed')],
      workflowRuns: [],
    });

    expect(insights.commitCount).toBe(3);
    expect(insights.mergedPullRequests).toBe(2);
    expect(insights.openPullRequests).toBe(1);
    expect(insights.closedPullRequests).toBe(1);
  });

  it('computes CI health only from completed runs — in-progress is never assumed green', () => {
    const insights = computeRepoInsights({
      workflowRuns: [
        makeRun(1, 'success'),
        makeRun(2, 'success'),
        makeRun(3, 'success'),
        makeRun(4, 'failed'),
        makeRun(5, 'in_progress'),
        makeRun(6, 'queued'),
      ],
    });

    expect(insights.ciCompletedRuns).toBe(4);
    expect(insights.ciSuccessfulRuns).toBe(3);
    expect(insights.ciHealthPercent).toBe(75);
  });

  it('reports CI health as unknown (null) when no run has completed', () => {
    const insights = computeRepoInsights({
      workflowRuns: [makeRun(1, 'in_progress'), makeRun(2, 'queued')],
    });

    expect(insights.ciCompletedRuns).toBe(0);
    expect(insights.ciHealthPercent).toBeNull();
  });

  it('buckets commits into real calendar days and counts distinct real workflows', () => {
    const now = new Date();
    const insights = computeRepoInsights(
      {
        commits: [makeCommit('b1', 0), makeCommit('b2', 0), makeCommit('b3', 1)],
        workflowRuns: [makeRun(1, 'success', 'CI'), makeRun(2, 'success', 'Release'), makeRun(3, 'failed', 'CI')],
      },
      now,
    );

    expect(insights.dailyCommits).toHaveLength(7);
    // Last bucket is today (2 commits), previous day has 1.
    expect(insights.dailyCommits[6].count).toBe(2);
    expect(insights.dailyCommits[5].count).toBe(1);
    expect(insights.dailyCommits[6].label).toBe(
      now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    );
    expect(insights.workflowCount).toBe(2);
  });

  it('never charts commits whose dates cannot be parsed', () => {
    const unparseable: CommitItem = { ...makeCommit('c1', 0), date: 'recently' };
    const insights = computeRepoInsights({ commits: [unparseable] });

    expect(insights.commitCount).toBe(1);
    expect(insights.dailyCommits).toEqual([]);
  });
});

describe('QM-UIUX-066: InsightsTab rendering real supplied data', () => {
  it('shows the computed figures and real date labels, not the fabricated ones', () => {
    const html = renderToStaticMarkup(
      <InsightsTab
        commits={[makeCommit('d1', 0), makeCommit('d2', 0), makeCommit('d3', 1)]}
        pullRequests={[makePr(1, 'merged'), makePr(2, 'merged'), makePr(3, 'open')]}
        workflowRuns={[
          makeRun(1, 'success'),
          makeRun(2, 'success'),
          makeRun(3, 'success'),
          makeRun(4, 'failed'),
        ]}
      />,
    );

    expect(html).toContain('3 Commits');
    expect(html).toContain('2 Pull Requests Merged');
    expect(html).toContain('1 open · 0 closed without merging');
    expect(html).toContain('75% CI Health');
    expect(html).toContain('3 of 4 recent workflow runs succeeded');
    expect(html).toContain('Commit Frequency &amp; Activity');
    for (const fabricated of FABRICATED_STRINGS) {
      expect(html).not.toContain(fabricated);
    }
  });

  it('with commits but no runs or PRs, shows honest unknown cards instead of invented figures', () => {
    const html = renderToStaticMarkup(<InsightsTab commits={[makeCommit('e1', 0)]} />);

    expect(html).toContain('1 Commit');
    expect(html).toContain('No pull request data available yet.');
    expect(html).toContain('No completed workflow runs yet — CI health is unknown.');
    expect(html).not.toContain('% CI Health');
    for (const fabricated of FABRICATED_STRINGS) {
      expect(html).not.toContain(fabricated);
    }
  });
});
