/**
 * fix/qm-idempotency-outbox-r4 — client-side durable operation id proofs for
 * the CODEX-REVIEW P0 on PR #1124 ("a retry is normally assigned a different
 * key": request K1 commits, its response is lost, the retry minted K2 and the
 * server executed the mutation again).
 *
 * Proves: the api-client mints ONE id per logical mutating call and reuses it
 * when the same call is retried after its response never arrived; any HTTP
 * response completes the operation so a later identical call is a NEW
 * operation with a fresh id; a caller-supplied idempotencyKey travels
 * verbatim (offline outbox replay).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { browserAuthSession } from '../browser-auth-session';
import {
  QuantMailApiClient,
  __clearPendingOperationsForTests,
} from '../api-client';

function okResponse(body: unknown = { success: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function statusResponse(status: number, body: unknown = { success: false }): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Extracts the Idempotency-Key header the client sent on call N (0-based). */
function sentKey(spy: ReturnType<typeof vi.spyOn>, n: number): string | undefined {
  const args = spy.mock.calls[n];
  const init = args?.[1] as { headers?: Record<string, string> } | undefined;
  const headers = init?.headers ?? {};
  const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === 'idempotency-key');
  return entry?.[1];
}

describe('api-client durable operation ids (PR #1124 P0)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let client: QuantMailApiClient;

  beforeEach(() => {
    __clearPendingOperationsForTests();
    client = new QuantMailApiClient('http://localhost:1');
    fetchSpy = vi.spyOn(browserAuthSession, 'authenticatedFetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __clearPendingOperationsForTests();
  });

  it('ordinary retry after a lost response reuses K1 (does NOT mint K2)', async () => {
    // First attempt: the response never arrives (timeout / network failure).
    fetchSpy.mockRejectedValueOnce(new Error('Request timed out'));
    const first = await client.sendEmail('draft-1', {});
    expect(first.success).toBe(false);
    expect(first.error?.code).toBe('TIMEOUT');

    // The user retries the same logical send; the server answers this time.
    fetchSpy.mockResolvedValueOnce(okResponse());
    const second = await client.sendEmail('draft-1', {});
    expect(second.success).toBe(true);

    const k1 = sentKey(fetchSpy, 0);
    const k2 = sentKey(fetchSpy, 1);
    expect(k1).toBeTruthy();
    // The P0 fix: the retry reuses the first attempt's id, so the server
    // replays the committed outcome instead of executing the send twice.
    expect(k2).toBe(k1);
  });

  it('a completed operation is closed: the next identical call mints a fresh id', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await client.sendEmail('draft-1', {});
    await client.sendEmail('draft-1', {});

    const k1 = sentKey(fetchSpy, 0);
    const k2 = sentKey(fetchSpy, 1);
    expect(k1).toBeTruthy();
    expect(k2).toBeTruthy();
    // send -> undo-send -> send again is a NEW logical operation each time.
    expect(k2).not.toBe(k1);
  });

  it('a caller-supplied idempotencyKey is sent verbatim (offline outbox replay)', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await client.sendEmail('draft-1', { idempotencyKey: 'outbox-mutation-9' });
    expect(sentKey(fetchSpy, 0)).toBe('outbox-mutation-9');
  });

  it('409 keeps the pending id: the follow-up retry still reuses K1', async () => {
    // 409 may be IDEMPOTENCY_IN_FLIGHT for our own key (concurrent
    // duplicate) — the operation is unanswered, so K1 must be kept.
    fetchSpy.mockResolvedValueOnce(statusResponse(409));
    await client.sendEmail('draft-1', {});

    fetchSpy.mockResolvedValueOnce(okResponse());
    await client.sendEmail('draft-1', {});

    expect(sentKey(fetchSpy, 1)).toBe(sentKey(fetchSpy, 0));
  });

  it('different logical operations get different ids', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await client.sendEmail('draft-1', {});
    await client.sendEmail('draft-2', {});
    expect(sentKey(fetchSpy, 0)).not.toBe(sentKey(fetchSpy, 1));
  });
});
