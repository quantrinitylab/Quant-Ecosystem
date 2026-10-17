import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchesTab } from '../components/BranchesTab';
import { mapBackendBranchToItem } from '../components/mapBackendBranch';
import { INITIAL_REPOS } from '../constants';
import type { BranchItem } from '../types';

// Author/message-honesty regression suite: the Branches tab used to map the
// backend payload with `lastCommitAuthor: b.lastCommitAuthor ||
// currentUsername` and `lastCommitMessage: b.lastCommitMessage || 'Update
// branch'` — but the branches endpoint returns NO per-branch last-commit
// fields at all (only name/sha/isDefault/isProtected/protection/aheadBy/
// behindBy), so EVERY branch row misattributed its last commit to the VIEWER
// and printed a fabricated commit message, pre-empting BranchesTab's own
// honest 'Unknown' fallback. Same invented-data defect family as the Commits
// tab's 'Sep 26, 2026' hardcoded-date fallback (PR #926).

const VIEWER = 'sahenoor';
const INVENTED_MESSAGE = 'Update branch';

function makeBackendBranch(overrides: Record<string, unknown> = {}) {
  // Real backend shape (backend/routes/repos.ts branches payload).
  return {
    name: 'feature/one',
    sha: 'a1b2c3d4e5f6000000000000000000000000000001',
    isDefault: false,
    isProtected: false,
    protection: 'none',
    aheadBy: 0,
    behindBy: 0,
    ...overrides,
  };
}

describe('mapBackendBranchToItem — no invented branch authors or messages', () => {
  it('degrades a real backend payload (no lastCommit* fields) to honest empties', () => {
    const item = mapBackendBranchToItem(makeBackendBranch(), 'main');
    expect(item.name).toBe('feature/one');
    expect(item.sha).toBe('a1b2c3d4e5f6000000000000000000000000000001');
    expect(item.lastCommitAuthor).toBe('');
    expect(item.lastCommitMessage).toBe('');
    // No false recency claim: the backend sends no time data, so the time
    // degrades to honest empty (the old `'recently'` fallback fabricated
    // "Updated recently by" on every row).
    expect(item.lastCommitTime).toBe('');
    // The viewer's identity must never leak into the mapped item.
    expect(JSON.stringify(item)).not.toContain(VIEWER);
    expect(JSON.stringify(item)).not.toContain(INVENTED_MESSAGE);
  });

  it('preserves real last-commit fields verbatim when the backend provides them', () => {
    const item = mapBackendBranchToItem(
      makeBackendBranch({
        lastCommitAuthor: 'devone',
        lastCommitMessage: 'fix: real commit',
        lastCommitTime: '2 days ago',
      }),
      'main',
    );
    expect(item.lastCommitAuthor).toBe('devone');
    expect(item.lastCommitMessage).toBe('fix: real commit');
    expect(item.lastCommitTime).toBe('2 days ago');
  });

  it('computes real relative time from the backend numeric lastCommitTimestamp', () => {
    // 5 hours ago — safely inside the "X hours ago" bucket, no boundary risk.
    const fiveHoursAgo = Math.floor(Date.now() / 1000) - 5 * 3600;
    const item = mapBackendBranchToItem(
      makeBackendBranch({ lastCommitTimestamp: fiveHoursAgo }),
      'main',
    );
    expect(item.lastCommitTime).toBe('5 hours ago');
  });

  it('accepts a numeric-string lastCommitTimestamp', () => {
    const twoDaysAgo = String(Math.floor(Date.now() / 1000) - 2 * 86400);
    const item = mapBackendBranchToItem(makeBackendBranch({ lastCommitTimestamp: twoDaysAgo }), 'main');
    expect(item.lastCommitTime).toBe('2 days ago');
  });

  it('never invents recency from missing, zero, negative or future timestamps', () => {
    for (const bad of [undefined, null, 0, -1, Number.NaN, 'not-a-number']) {
      expect(
        mapBackendBranchToItem(makeBackendBranch({ lastCommitTimestamp: bad }), 'main').lastCommitTime,
      ).toBe('');
    }
    // A future-dated timestamp is data corruption, not recency.
    const oneHourFuture = Math.floor(Date.now() / 1000) + 3600;
    expect(
      mapBackendBranchToItem(makeBackendBranch({ lastCommitTimestamp: oneHourFuture }), 'main')
        .lastCommitTime,
    ).toBe('');
  });

  it('honours explicit isDefault/isProtected and sha fallbacks', () => {
    expect(mapBackendBranchToItem(makeBackendBranch({ isDefault: true }), 'main').isDefault).toBe(true);
    // The name fallback only applies when the backend omits isDefault entirely.
    expect(
      mapBackendBranchToItem(makeBackendBranch({ name: 'main', isDefault: undefined }), 'main').isDefault,
    ).toBe(true);
    expect(
      mapBackendBranchToItem(makeBackendBranch({ name: 'other', isDefault: undefined }), 'main').isDefault,
    ).toBe(false);
    expect(
      mapBackendBranchToItem(makeBackendBranch({ sha: '', commitSha: 'deadbeef' }), 'main').sha,
    ).toBe('deadbeef');
  });
});

describe('BranchesTab — branch rows never misattribute authorship', () => {
  const repo = INITIAL_REPOS[0];

  function mappedBranches(): BranchItem[] {
    // Simulate exactly what the page's fetchRepoBranches does now.
    return [makeBackendBranch({ name: 'main', isDefault: true }), makeBackendBranch({ name: 'feature/one' })].map(
      (b) => mapBackendBranchToItem(b, 'main'),
    );
  }

  it('renders "Unknown" author and no fabricated message for backend rows', () => {
    const html = renderToStaticMarkup(
      <BranchesTab repo={repo} branches={mappedBranches()} currentUsername={VIEWER} />,
    );
    expect(html).toContain('Unknown');
    expect(html).not.toContain(INVENTED_MESSAGE);
    // The viewer must never appear as a branch's last-commit author.
    expect(html).not.toContain(VIEWER);
  });

  it('never renders a fabricated "Updated recently by" — unknown time degrades honestly', () => {
    // mappedBranches() items have '' lastCommitTime (no backend time data).
    const html = renderToStaticMarkup(
      <BranchesTab repo={repo} branches={mappedBranches()} currentUsername={VIEWER} />,
    );
    expect(html).not.toContain('Updated recently');
    expect(html).not.toContain('recently by');
    expect(html).toContain('Last update unavailable');
  });

  it('renders the real computed relative time when the backend supplies a timestamp', () => {
    const fiveHoursAgo = Math.floor(Date.now() / 1000) - 5 * 3600;
    const item = mapBackendBranchToItem(
      makeBackendBranch({ name: 'feature/fresh', lastCommitTimestamp: fiveHoursAgo }),
      'main',
    );
    const html = renderToStaticMarkup(
      <BranchesTab repo={repo} branches={[item]} currentUsername={VIEWER} />,
    );
    expect(html).toContain('Updated 5 hours ago by');
    expect(html).not.toContain('Last update unavailable');
  });

  it('still renders real author/message data supplied by the backend', () => {
    const real = mapBackendBranchToItem(
      makeBackendBranch({
        name: 'feature/real',
        lastCommitAuthor: 'devone',
        lastCommitMessage: 'feat: ship the thing',
        lastCommitTime: '3 hours ago',
      }),
      'main',
    );
    const html = renderToStaticMarkup(
      <BranchesTab repo={repo} branches={[real]} currentUsername={VIEWER} />,
    );
    expect(html).toContain('devone');
    expect(html).toContain('feat: ship the thing');
    expect(html).toContain('3 hours ago');
  });
});
