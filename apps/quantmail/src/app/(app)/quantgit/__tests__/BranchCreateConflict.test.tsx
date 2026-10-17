/**
 * fix/qm-commit-existing-branch-check — regression tests for the
 * commit-to-new-branch conflict guard.
 *
 * Root cause: handleCommitBlob's branch-POST was fire-and-forget
 * (apiFetch/authenticatedFetch returns the Response without throwing on
 * HTTP errors; the try/catch only covered transport failures). A 409
 * BRANCH_EXISTS was therefore swallowed and the follow-up file commit
 * silently landed on the PRE-EXISTING branch — while the UI promised
 * "Create a new branch for this commit and start a pull request".
 *
 * Contract under test (assertBranchCreated in ../branchCreate):
 * - 201 (branch created) → resolves: the commit may proceed.
 * - 409 + { error: { code: 'BRANCH_EXISTS' } } → throws BranchExistsError
 *   naming the branch, so the caller STOPS before committing.
 * - 409 + unparseable/empty body → still throws (defensive: on this
 *   endpoint any 409 means the name is not fresh).
 * - 409 + an unexpected error code → still throws (stopping is safer than
 *   silently committing onto a branch this flow did not create).
 * - transport rejection (network/timeout) → propagates untouched: the
 *   caller keeps its honest offline-fallback behavior.
 */

import { describe, expect, it, vi } from 'vitest';
import { assertBranchCreated, BranchExistsError } from '../branchCreate';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function opaqueResponse(status: number): Response {
  return new Response('<!doctype html><html></html>', { status });
}

describe('assertBranchCreated', () => {
  it('resolves when the branch is created (201) — the commit may proceed', async () => {
    const createBranch = vi.fn().mockResolvedValue(
      jsonResponse(201, { success: true, data: { name: 'patch-1' } }),
    );
    await expect(assertBranchCreated(createBranch, 'patch-1')).resolves.toBeUndefined();
    expect(createBranch).toHaveBeenCalledTimes(1);
  });

  it('throws BranchExistsError on 409 BRANCH_EXISTS — the commit must stop', async () => {
    const createBranch = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        success: false,
        error: { code: 'BRANCH_EXISTS', message: 'Branch already exists', statusCode: 409 },
      }),
    );
    const err = await assertBranchCreated(createBranch, 'my-feature').catch((e) => e);
    expect(err).toBeInstanceOf(BranchExistsError);
    expect(err.branchName).toBe('my-feature');
    expect(err.message).toContain('"my-feature"');
    expect(err.message).toContain('already exists');
    expect(err.message).toContain('No commit was made');
  });

  it('throws on a bare 409 with an unparseable body', async () => {
    const createBranch = vi.fn().mockResolvedValue(opaqueResponse(409));
    await expect(assertBranchCreated(createBranch, 'patch-2')).rejects.toBeInstanceOf(
      BranchExistsError,
    );
  });

  it('throws on 409 with an unexpected error code instead of risking a silent commit', async () => {
    const createBranch = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        success: false,
        error: { code: 'SOME_OTHER_CONFLICT', message: 'conflict' },
      }),
    );
    const err = await assertBranchCreated(createBranch, 'patch-3').catch((e) => e);
    expect(err).toBeInstanceOf(BranchExistsError);
    expect(err.message).toContain('SOME_OTHER_CONFLICT');
  });

  it('propagates transport failures untouched (offline fallback stays with the caller)', async () => {
    const networkFailure = new TypeError('Failed to fetch');
    const createBranch = vi.fn().mockRejectedValue(networkFailure);
    await expect(assertBranchCreated(createBranch, 'patch-4')).rejects.toBe(networkFailure);
  });

  it('does not treat other non-409 error statuses as a name conflict', async () => {
    const createBranch = vi.fn().mockResolvedValue(
      jsonResponse(500, { success: false, error: { code: 'INTERNAL', message: 'boom' } }),
    );
    await expect(assertBranchCreated(createBranch, 'patch-5')).resolves.toBeUndefined();
  });
});
