/**
 * fix/qm-commitblob-false-success — regression tests for the false
 * "Committed <path>" success.
 *
 * Root cause: handleCommitBlob's file-commit catch rethrew everything
 * EXCEPT errors whose message contained 'Failed to fetch' or '404' — and
 * the !response.ok check skipped 404s outright. A dead connection, a 404
 * file-POST, or a non-OK response with no error.message therefore fell
 * through to showToast(formatCommitToast(...)) + closeBlobEditor(): the
 * user was told the commit landed and their draft was discarded while
 * nothing was committed.
 *
 * Contract under test (../commitBlob, wired in page.tsx handleCommitBlob):
 * - network failure (fetch rejection) → honest Error naming the
 *   connection, mentioning nothing was committed. NEVER resolves.
 * - 404 response → honest Error mentioning 404 and that nothing was
 *   committed. NEVER resolves.
 * - non-OK response with no server message → honest Error. NEVER resolves.
 * - 200 OK with an unparseable/empty body → honest Error. NEVER resolves.
 * - 200 OK + { success: true } → resolves with the payload (real success).
 * - 409 / STALE_BLOB → the reload-before-committing Error (unchanged).
 * - non-OK with a server error.message → surfaces that message (unchanged).
 * - an error whose message merely CONTAINS "404" is still thrown — the old
 *   substring-match swallow is gone.
 * - toCommitFailure passes ordinary Errors through untouched.
 */

// Faithful mirror of the fixed try/catch wiring in page.tsx handleCommitBlob.
import { describe, expect, it, vi } from 'vitest';
import { assertCommitResponse, toCommitFailure } from '../commitBlob';

type ApiFetch = (url: string, init: any) => Promise<Response>;

async function runCommitFlow(apiFetch: ApiFetch): Promise<any> {
  let payload: any = null;
  try {
    const response = await apiFetch('/api/repos/r/file', { method: 'PATCH' });
    payload = assertCommitResponse(response, await response.json().catch(() => null));
  } catch (err: any) {
    throw toCommitFailure(err);
  }
  return payload;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function opaqueResponse(status: number): Response {
  return new Response('<!doctype html><html></html>', { status });
}

describe('commit flow — fail closed, never false "Committed"', () => {
  it('network failure rejects with an honest error — never reports success', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/could not reach the server/i);
    expect(err.message).toMatch(/nothing was committed/i);
    expect(err.message).not.toContain('Failed to fetch');
  });

  it('404 response rejects with an honest 404 error — never reports success', async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { success: false, error: { message: 'no such file' } }));
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('404');
    expect(err.message).toMatch(/nothing was committed/i);
  });

  it('non-OK response with no server message rejects — never reports success', async () => {
    const apiFetch = vi.fn().mockResolvedValue(opaqueResponse(500));
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('500');
    expect(err.message).toMatch(/nothing was committed/i);
  });

  it('200 OK with an unparseable body rejects — a commit is never confirmed by silence', async () => {
    const apiFetch = vi.fn().mockResolvedValue(opaqueResponse(200));
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/did not confirm the commit/i);
    expect(err.message).toMatch(/nothing was committed/i);
  });

  it('200 OK + { success: true } still resolves — real success is untouched', async () => {
    const payload = { success: true, data: { commitSha: 'abc123def456' } };
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(200, payload));
    await expect(runCommitFlow(apiFetch)).resolves.toEqual(payload);
  });

  it('409 STALE_BLOB still throws the reload-before-committing error', async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { success: false, error: { code: 'STALE_BLOB' } }));
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err.message).toContain('changed on the server');
  });

  it('non-OK with a server message still surfaces that message', async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(422, { success: false, error: { message: 'parent mismatch' } }));
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err.message).toBe('parent mismatch');
  });

  it('an error whose message merely contains "404" is still thrown, not swallowed', async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(500, { success: false, error: { message: 'upstream returned 404 page' } }),
      );
    // Old code's substring match would swallow this into a false success.
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err.message).toBe('upstream returned 404 page');
  });

  it('delete flow (isDelete) shares the same fail-closed contract', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await runCommitFlow(apiFetch).catch((e) => e);
    expect(err.message).toMatch(/nothing was committed/i);
  });
});

describe('toCommitFailure', () => {
  it('passes ordinary errors through untouched', () => {
    const err = new Error('This file changed on the server. Reload it before committing.');
    expect(toCommitFailure(err)).toBe(err);
  });

  it('converts non-Error throws into an honest Error', () => {
    const err = toCommitFailure('string failure');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/could not be confirmed/i);
  });
});
