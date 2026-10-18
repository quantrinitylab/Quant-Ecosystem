/**
 * PR-detail modal merge-box honesty — regression for qm-modal-conflict-claim.
 *
 * The modal's merge box used to hard-code
 *   "This branch has no conflicts with the base branch."
 * without any backend verification. It must now use the same real backend
 * dry-run (GET /api/repos/:id/pulls/:number/mergeable) as the
 * PullRequestsTab merge box, and only show the "no conflicts" claim after a
 * verified mergeable verdict. A detected conflict blocks the merge button.
 *
 * NOTE: sibling suites render via react-dom/server (the quantmail package has
 * no @testing-library/react dependency), so this file does the same.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@quant/api-client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@quant/api-client';
import {
  fetchPRDetailMergeable,
  mergeBlockedByConflict,
  PRDetailMergeActionBox,
} from '../components/QuantGitModals';
import { MergeConflictStatus } from '../components/PullRequestsTab';

const mockApiFetch = vi.mocked(apiFetch);

const PR = {
  id: 7,
  number: 42,
  title: 'fix: honest merge claim',
  state: 'open',
  author: 'alice',
  createdAt: '2026-10-13T00:00:00Z',
  branch: 'fix/x',
  baseBranch: 'main',
} as never;

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('fetchPRDetailMergeable (backend dry-run)', () => {
  it('returns mergeable when the backend says mergeable=true', async () => {
    mockApiFetch.mockResolvedValue({
      success: true,
      data: { mergeable: true },
    } as never);
    const state = await fetchPRDetailMergeable('r1', 42);
    expect(state).toEqual({ status: 'mergeable' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/repos/r1/pulls/42/mergeable');
  });

  it('returns conflict with file list when the backend says mergeable=false', async () => {
    mockApiFetch.mockResolvedValue({
      success: true,
      data: { mergeable: false, conflicts: ['src/a.ts', 'src/b.ts'] },
    } as never);
    const state = await fetchPRDetailMergeable('r1', 42);
    expect(state).toEqual({
      status: 'conflict',
      conflicts: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('returns unknown when the backend has no verdict yet (mergeable=null)', async () => {
    mockApiFetch.mockResolvedValue({
      success: true,
      data: { mergeable: null },
    } as never);
    expect(await fetchPRDetailMergeable('r1', 42)).toEqual({ status: 'unknown' });
  });

  it('returns unknown on unsuccessful responses and on network errors', async () => {
    mockApiFetch.mockResolvedValue({ success: false, data: null } as never);
    expect(await fetchPRDetailMergeable('r1', 42)).toEqual({ status: 'unknown' });
    mockApiFetch.mockRejectedValue(new Error('offline'));
    expect(await fetchPRDetailMergeable('r1', 42)).toEqual({ status: 'unknown' });
  });
});

describe('mergeBlockedByConflict', () => {
  it('blocks only on a detected conflict', () => {
    expect(mergeBlockedByConflict({ status: 'conflict', conflicts: [] })).toBe(true);
    expect(mergeBlockedByConflict({ status: 'mergeable' })).toBe(false);
    expect(mergeBlockedByConflict({ status: 'checking' })).toBe(false);
    expect(mergeBlockedByConflict({ status: 'unknown' })).toBe(false);
  });
});

describe('MergeConflictStatus claim honesty', () => {
  it('shows the no-conflict claim ONLY for a verified mergeable verdict', () => {
    const html = renderToStaticMarkup(<MergeConflictStatus check={{ status: 'mergeable' }} />);
    expect(html).toContain('This branch has no conflicts with the base branch.');
  });

  it('shows conflict state and blocks instead of claiming clean', () => {
    const html = renderToStaticMarkup(
      <MergeConflictStatus check={{ status: 'conflict', conflicts: ['src/a.ts'] }} />,
    );
    expect(html).toContain('merge-conflict-detected');
    expect(html).toContain('has conflicts with the base branch');
    expect(html).toContain('src/a.ts');
    expect(html).not.toContain('This branch has no conflicts with the base branch.');
  });

  it('never claims clean while checking or when the verdict is unknown', () => {
    const checking = renderToStaticMarkup(<MergeConflictStatus check={{ status: 'checking' }} />);
    const unknown = renderToStaticMarkup(<MergeConflictStatus check={{ status: 'unknown' }} />);
    for (const html of [checking, unknown]) {
      expect(html).not.toContain('This branch has no conflicts with the base branch.');
    }
    expect(checking).toContain('Checking for merge conflicts');
    expect(unknown).toContain('merge-conflict-unknown');
    expect(unknown).toContain('neither a pass nor a failure');
  });
});

describe('PRDetailMergeActionBox initial honesty', () => {
  it('shows checking state, not the unverified no-conflict claim, before the pre-check runs', () => {
    // useEffect does not run under renderToStaticMarkup, so this is the
    // honest initial state users see while the backend pre-check is pending.
    const html = renderToStaticMarkup(
      <PRDetailMergeActionBox repoId="r1" pr={PR} onMerge={() => {}} />,
    );
    expect(html).toContain('pr-detail-merge-box');
    expect(html).toContain('Checking for merge conflicts');
    expect(html).not.toContain('This branch has no conflicts with the base branch.');
    // Merge button must not be hard-disabled on the unverified state.
    expect(html).toContain('Merge pull request');
    expect(html).not.toContain('Resolve merge conflicts before merging');
  });
});
