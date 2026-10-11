import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommitsTab } from '../components/CommitsTab';
import { mapBackendCommitToItem } from '../components/mapBackendCommit';
import { computeRepoInsights } from '../components/InsightsTab';
import { INITIAL_REPOS } from '../constants';
import type { CommitItem } from '../types';

// Date-honesty regression suite: the Commits tab used to fall back to a
// hardcoded historical date (`date: c.date || 'Sep 26, 2026'`) when the
// backend omitted a commit date — and the real commits endpoint only
// returns a numeric `timestamp`, so EVERY real commit rendered under an
// invented "Commits on Sep 26, 2026" header that never aged. The UI must
// degrade to an honest empty date / "Undated commits" bucket instead of
// inventing a specific date, the same defect family as the RepoActivityFeed
// "NaNd" guard (PR #896).

const INVENTED_DATE = 'Sep 26, 2026';

function makeCommit(overrides: Partial<CommitItem> = {}): CommitItem {
  return {
    sha: 'c4e6121abc000000000000000000000000000001',
    shortSha: 'c4e6121',
    message: 'fix: honest commit dates',
    author: { name: 'Dev One', username: 'devone', email: 'devone@quantmail.in', avatarUrl: '' },
    date: '',
    relativeTime: 'recently',
    verified: false,
    ...overrides,
  };
}

describe('mapBackendCommitToItem — no invented commit dates', () => {
  it('degrades a missing date to an honest empty string, never a hardcoded date', () => {
    // Real backend shape: numeric timestamp, no `date` / `relativeTime`.
    const raw = {
      sha: 'abc1234def000000000000000000000000000001',
      parents: [],
      author: { name: 'Dev One', email: 'devone@quantmail.in' },
      timestamp: 1760000000,
      message: 'real commit',
    };
    const item = mapBackendCommitToItem(raw, 'tester');
    expect(item.date).toBe('');
    expect(item.date).not.toBe(INVENTED_DATE);
    expect(item.relativeTime).toBe('recently');
    expect(item.sha).toBe(raw.sha);
    expect(item.shortSha).toBe('abc1234');
    expect(item.message).toBe('real commit');
    expect(item.verified).toBe(false);
  });

  it('preserves a real date string supplied by the backend verbatim', () => {
    const item = mapBackendCommitToItem(
      { sha: 'x'.repeat(40), date: 'Oct 10, 2026', relativeTime: '2 days ago' },
      'tester',
    );
    expect(item.date).toBe('Oct 10, 2026');
    expect(item.relativeTime).toBe('2 days ago');
  });

  it('prefers timeAgo over the honest relativeTime fallback', () => {
    const item = mapBackendCommitToItem({ sha: 'y'.repeat(40), timeAgo: '5h ago' }, 'tester');
    expect(item.relativeTime).toBe('5h ago');
    expect(item.date).toBe('');
  });
});

describe('CommitsTab — undated commits are honest, never misdated', () => {
  const repo = INITIAL_REPOS[0];

  it('groups dateless commits under "Undated commits" with no invented date anywhere', () => {
    const html = renderToStaticMarkup(
      <CommitsTab
        repo={repo}
        commits={[makeCommit({ date: '' }), makeCommit({ date: '', sha: 'd'.repeat(40), shortSha: 'ddddddd' })]}
        currentBranch="main"
        repoBranches={['main']}
      />,
    );
    expect(html).toContain('Undated commits');
    expect(html).not.toContain('Commits on');
    expect(html).not.toContain(INVENTED_DATE);
    // The honest relative-time slot still renders.
    expect(html).toContain('recently');
  });

  it('still groups real-date commits under "Commits on <date>"', () => {
    const html = renderToStaticMarkup(
      <CommitsTab
        repo={repo}
        commits={[makeCommit({ date: 'Oct 10, 2026', relativeTime: '2 days ago' })]}
        currentBranch="main"
        repoBranches={['main']}
      />,
    );
    expect(html).toContain('Commits on Oct 10, 2026');
    expect(html).toContain('2 days ago');
    expect(html).not.toContain(INVENTED_DATE);
  });

  it('renders dateless and dated commits side by side without cross-contamination', () => {
    const html = renderToStaticMarkup(
      <CommitsTab
        repo={repo}
        commits={[
          makeCommit({ date: 'Oct 10, 2026' }),
          makeCommit({ date: '', sha: 'e'.repeat(40), shortSha: 'eeeeeee', message: 'undated commit' }),
        ]}
        currentBranch="main"
        repoBranches={['main']}
      />,
    );
    expect(html).toContain('Commits on Oct 10, 2026');
    expect(html).toContain('Undated commits');
    expect(html).toContain('undated commit');
    expect(html).not.toContain(INVENTED_DATE);
  });
});

describe('InsightsTab — undated commits are never bucketed on an invented day', () => {
  it('returns no daily buckets when no commit has a parseable date', () => {
    const insights = computeRepoInsights({
      commits: [makeCommit({ date: '' }), makeCommit({ date: '', sha: 'f'.repeat(40) })],
    });
    expect(insights.commitCount).toBe(2);
    expect(insights.dailyCommits).toEqual([]);
  });

  it('still buckets commits that carry a real recent date', () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const realDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const insights = computeRepoInsights({ commits: [makeCommit({ date: realDate })] });
    expect(insights.dailyCommits.length).toBe(7);
    expect(insights.dailyCommits.reduce((n, b) => n + b.count, 0)).toBe(1);
  });
});
