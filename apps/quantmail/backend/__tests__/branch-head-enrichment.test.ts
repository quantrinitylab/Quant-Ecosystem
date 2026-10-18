// @vitest-environment node
// ============================================================================
// enrichBranchesWithHeadCommits — branch "Updated … by" honesty.
//
// Proves the branches endpoints attach REAL per-branch head-commit data
// (author name, Unix-second timestamp, message from `git log -1 <branch>`)
// and that unresolvable branches (stale DB rows, missing git storage, git
// failures) degrade to NO enrichment fields — never an invented timestamp
// or author. The old frontend fallback (`lastCommitTime || 'recently'`)
// fabricated "Updated recently by" on every row; with no enrichment fields
// the UI renders its honest "last update unavailable" slot.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { enrichBranchesWithHeadCommits } from '../modules/code/services/branch-head-enrichment';

function fakeInspect(headByBranch: Record<string, unknown>) {
  return {
    getCommits: vi.fn(async (_owner: string, _name: string, ref: string, opts: { limit: number }) => {
      if (!(ref in headByBranch)) return [];
      return [headByBranch[ref]];
    }),
  };
}

const HEAD = {
  sha: 'a1b2c3d4e5f6000000000000000000000000000001',
  parents: [],
  author: { name: 'devone', email: 'devone@example.com' },
  timestamp: 1729490000,
  message: 'feat: ship the thing',
};

describe('enrichBranchesWithHeadCommits', () => {
  it('attaches real head-commit data per branch with one limit:1 lookup each', async () => {
    const inspect = fakeInspect({ main: HEAD, 'feature/one': { ...HEAD, author: { name: 'devtwo', email: 'd@x.io' } } });
    const rows = [{ name: 'main' }, { name: 'feature/one' }];
    const out = await enrichBranchesWithHeadCommits(rows, inspect as never, 'owner-1', 'repo-a');

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      name: 'main',
      lastCommitTimestamp: 1729490000,
      lastCommitAuthor: 'devone',
      lastCommitMessage: 'feat: ship the thing',
    });
    expect(out[1]).toMatchObject({ name: 'feature/one', lastCommitAuthor: 'devtwo' });

    expect(inspect.getCommits).toHaveBeenCalledTimes(2);
    expect(inspect.getCommits).toHaveBeenCalledWith('owner-1', 'repo-a', 'main', { limit: 1 });
    expect(inspect.getCommits).toHaveBeenCalledWith('owner-1', 'repo-a', 'feature/one', { limit: 1 });
  });

  it('leaves unresolvable branches unenriched — no invented fields', async () => {
    const inspect = fakeInspect({ main: HEAD }); // 'feature/stale' has no git ref
    const out = await enrichBranchesWithHeadCommits(
      [{ name: 'main' }, { name: 'feature/stale' }],
      inspect as never,
      'owner-1',
      'repo-a',
    );
    expect(out[1]).toEqual({ name: 'feature/stale' });
    expect('lastCommitTimestamp' in out[1]).toBe(false);
    expect('lastCommitAuthor' in out[1]).toBe(false);
  });

  it('degrades honestly when git throws for a branch', async () => {
    const inspect = {
      getCommits: vi.fn(async (_o: string, _n: string, ref: string) => {
        if (ref === 'feature/broken') throw new Error('git failed');
        return [HEAD];
      }),
    };
    const out = await enrichBranchesWithHeadCommits(
      [{ name: 'main' }, { name: 'feature/broken' }],
      inspect as never,
      'owner-1',
      'repo-a',
    );
    expect(out[0]).toMatchObject({ lastCommitTimestamp: 1729490000 });
    expect(out[1]).toEqual({ name: 'feature/broken' });
  });

  it('omits corrupt timestamps but still enriches author/message', async () => {
    const inspect = fakeInspect({
      main: { ...HEAD, timestamp: 0 },
      'feature/neg': { ...HEAD, timestamp: -5 },
    });
    const out = await enrichBranchesWithHeadCommits(
      [{ name: 'main' }, { name: 'feature/neg' }],
      inspect as never,
      'owner-1',
      'repo-a',
    );
    // A zero/negative timestamp is data corruption, not recency: no invented time.
    expect('lastCommitTimestamp' in out[0]).toBe(false);
    expect('lastCommitTimestamp' in out[1]).toBe(false);
    expect(out[0].lastCommitAuthor).toBe('devone');
    expect(out[0].lastCommitMessage).toBe('feat: ship the thing');
  });

  it('omits blank author names and empty messages', async () => {
    const inspect = fakeInspect({
      main: { ...HEAD, author: { name: '', email: '' }, message: '' },
    });
    const out = await enrichBranchesWithHeadCommits([{ name: 'main' }], inspect as never, 'o', 'r');
    expect(out[0].lastCommitTimestamp).toBe(1729490000);
    expect('lastCommitAuthor' in out[0]).toBe(false);
    expect('lastCommitMessage' in out[0]).toBe(false);
  });

  it('does not mutate the input rows', async () => {
    const inspect = fakeInspect({ main: HEAD });
    const rows = [{ name: 'main' }];
    await enrichBranchesWithHeadCommits(rows, inspect as never, 'o', 'r');
    expect(rows[0]).toEqual({ name: 'main' });
  });
});
