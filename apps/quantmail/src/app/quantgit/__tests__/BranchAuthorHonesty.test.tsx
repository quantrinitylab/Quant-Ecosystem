import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchesTab } from '../components/BranchesTab';
import { mapBackendBranchToItem } from '../components/mapBackendBranch';
import { buildCreatedBranchRow } from '../components/createdBranchRow';
import type { BranchItem, Repo } from '../types';

// Minimal clearly-labeled test repo (the dead mock-fixture module
// quantgit/constants.ts was removed; tests must not depend on it).
const TEST_REPO: Repo = {
  id: 'test-repo',
  name: 'test-repo',
  fullName: 'tester/test-repo',
  description: 'Test repo for branch-author honesty tests',
  visibility: 'private',
  language: '',
  stars: 0,
  forks: 0,
  watching: 0,
  cloneUrl: '',
  defaultBranch: 'main',
  latestCommit: '',
  latestCommitSha: '',
  latestCommitTime: new Date(Date.now() - 5*60*60*1000).toISOString(),
  checksStatus: 'unknown',
  license: '',
  website: '',
  topics: [],
};

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
  const repo = TEST_REPO;

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

// Optimistic new-branch rows (finding: optimistic rows misattributed the
// branch's last commit to the creator). A new branch points at its SOURCE
// head commit, so its last commit IS the source head's commit — same sha,
// author, message and time — never a commit by the viewer, and never an
// invented "Branch created from X" message, "just now" recency, or
// "pending" pseudo-sha. Both create paths (page.tsx and BranchesTab) build
// the row through buildCreatedBranchRow, so these tests pin the shared
// helper and the tab's rendering of its rows.
describe('buildCreatedBranchRow — new branch inherits the source head commit', () => {
  const SOURCE_HEAD: BranchItem = {
    name: 'main',
    sha: 'a1b2c3d4e5f6000000000000000000000000000001',
    isDefault: true,
    isProtected: true,
    protection: 'require_reviews',
    aheadBy: 0,
    behindBy: 0,
    lastCommitAuthor: 'devone',
    lastCommitMessage: 'feat: ship the thing',
    lastCommitTime: '3 hours ago',
  };

  it('copies the source head sha/author/message/time verbatim', () => {
    const row = buildCreatedBranchRow('feature/new', SOURCE_HEAD);
    expect(row.name).toBe('feature/new');
    expect(row.sha).toBe(SOURCE_HEAD.sha);
    expect(row.lastCommitAuthor).toBe('devone');
    expect(row.lastCommitMessage).toBe('feat: ship the thing');
    expect(row.lastCommitTime).toBe('3 hours ago');
    expect(row.isDefault).toBe(false);
    expect(row.aheadBy).toBe(0);
    expect(row.behindBy).toBe(0);
  });

  it('never attributes the row to the viewer — the helper takes no username at all', () => {
    const row = buildCreatedBranchRow('feature/new', SOURCE_HEAD);
    expect(JSON.stringify(row)).not.toContain(VIEWER);
    expect(JSON.stringify(row)).not.toContain('Branch created from');
    expect(JSON.stringify(row)).not.toContain('just now');
    expect(JSON.stringify(row)).not.toContain('pending');
  });

  it('falls back to the backend-confirmed head sha when the source head is unknown', () => {
    const backendSha = 'b2c3d4e5f6000000000000000000000000000000002';
    const row = buildCreatedBranchRow('feature/new', undefined, backendSha);
    expect(row.sha).toBe(backendSha);
    // Author/message/time stay honestly empty — the create response
    // carries no such fields, so nothing is invented for them.
    expect(row.lastCommitAuthor).toBe('');
    expect(row.lastCommitMessage).toBe('');
    expect(row.lastCommitTime).toBe('');
    expect(JSON.stringify(row)).not.toContain('pending');
  });

  it('degrades to fully honest empties when neither source head nor backend sha is known', () => {
    const row = buildCreatedBranchRow('feature/new', undefined);
    expect(row.sha).toBe('');
    expect(row.lastCommitAuthor).toBe('');
    expect(row.lastCommitMessage).toBe('');
    expect(row.lastCommitTime).toBe('');
  });

  it('renders the source head author/message for a helper-built row, never the viewer', () => {
    const row = buildCreatedBranchRow('feature/new', SOURCE_HEAD);
    const html = renderToStaticMarkup(
      <BranchesTab repo={TEST_REPO} branches={[SOURCE_HEAD, row]} currentUsername={VIEWER} />,
    );
    expect(html).toContain('feature/new');
    expect(html).toContain('devone');
    expect(html).toContain('feat: ship the thing');
    expect(html).toContain('3 hours ago');
    expect(html).not.toContain(VIEWER);
    expect(html).not.toContain('Branch created from');
    expect(html).not.toContain('Updated just now by');
  });

  it('renders an unknown-source helper-built row honestly (no fabricated recency or message)', () => {
    const row = buildCreatedBranchRow('feature/fresh', undefined);
    const html = renderToStaticMarkup(
      <BranchesTab repo={TEST_REPO} branches={[row]} currentUsername={VIEWER} />,
    );
    expect(html).toContain('feature/fresh');
    expect(html).toContain('Last update unavailable');
    expect(html).toContain('Unknown');
    expect(html).not.toContain(VIEWER);
    expect(html).not.toContain('Branch created from');
    expect(html).not.toContain('Updated just now by');
  });
});
