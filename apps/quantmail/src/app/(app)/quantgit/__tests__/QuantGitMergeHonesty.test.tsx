import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { interpretMergeResult, mergeFailureToast } from '../mergeOutcome';
import { PullRequestsTab } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

/**
 * Proves the QuantGit PR surface never fabricates a merge or a checks gate:
 * - interpretMergeResult resolves merged:true ONLY for a genuine 2xx response.
 * - Non-ok responses surface the backend's real error (or an honest fallback).
 * - The PR list row shows "Checks unknown", never an invented 55/56 count.
 */

const MOCK_PR: PRItem = {
  id: 301,
  title: 'fix: honest merge reporting',
  state: 'open',
  author: 'tester',
  branchSource: 'fix/honest-merge',
  branchTarget: 'main',
  checksStatus: 'unknown',
  commentsCount: 0,
  createdAt: '1 minute ago',
  additions: 3,
  deletions: 1,
  changedFiles: 1,
};

function renderPRList() {
  return renderToStaticMarkup(
    <PullRequestsTab
      pullSearchQuery=""
      setPullSearchQuery={vi.fn()}
      filteredPulls={[MOCK_PR]}
      openPullsCount={1}
      closedPullsCount={0}
    />,
  );
}

describe('interpretMergeResult — merge is claimed only on genuine success', () => {
  it('resolves merged:true only for a 2xx response', async () => {
    const outcome = await interpretMergeResult(new Response('{}', { status: 200 }), 12);
    expect(outcome).toEqual({ merged: true });
  });

  it('never claims merged on a non-ok response (409 already merged)', async () => {
    const res = new Response(
      JSON.stringify({ error: { message: 'Pull request is already merged' } }),
      { status: 409 },
    );
    const outcome = await interpretMergeResult(res, 12);
    expect(outcome).toEqual({
      merged: false,
      toast: 'Pull request is already merged',
    });
  });

  it('never claims merged on a non-ok response (403 branch protection)', async () => {
    const res = new Response(
      JSON.stringify({ error: { message: 'Required status checks have not passed' } }),
      { status: 403 },
    );
    const outcome = await interpretMergeResult(res, 12);
    expect(outcome.merged).toBe(false);
    expect(outcome).toEqual({
      merged: false,
      toast: 'Required status checks have not passed',
    });
  });

  it('falls back to an honest generic message when the body has no usable error', async () => {
    const outcome = await interpretMergeResult(new Response('{}', { status: 500 }), 12);
    expect(outcome).toEqual({ merged: false, toast: mergeFailureToast(12) });
    expect(outcome.merged).toBe(false);
    expect((outcome as { toast: string }).toast).not.toContain('merged into');
  });

  it('falls back to an honest generic message when the body is not JSON', async () => {
    const outcome = await interpretMergeResult(
      new Response('<html>gateway error</html>', { status: 502 }),
      12,
    );
    expect(outcome).toEqual({ merged: false, toast: mergeFailureToast(12) });
  });

  it('ignores a blank backend message and uses the honest fallback', async () => {
    const res = new Response(JSON.stringify({ error: { message: '   ' } }), { status: 500 });
    const outcome = await interpretMergeResult(res, 12);
    expect(outcome).toEqual({ merged: false, toast: mergeFailureToast(12) });
  });
});

describe('PR list — no invented check counts', () => {
  it('shows an honest "Checks unknown" chip instead of a fabricated 55/56 count', () => {
    const html = renderPRList();
    expect(html).toContain('Checks unknown');
    expect(html).not.toContain('55/56');
    expect(html).not.toContain('passed');
  });
});
