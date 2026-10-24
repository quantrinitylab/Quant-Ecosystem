/**
 * fix/qm-accounts-import-corrective-3 — client wire contract for the send-as
 * corrective (CODEX-REVIEW 6377798303 on blocked PR #1518).
 *
 * The principal /compose journey dropped the selected send-as identity on
 * the host-callback path. The client half of the fix: the composer's
 * `sendAsId` must reach the backend verbatim on compose AND on draft
 * updates — including an EXPLICIT null, which the backend's absent-key
 * discipline reads as "revert this draft's From to the account's own
 * address" (absent key = "not edited, keep what is stored").
 *
 * These tests pin the api-client's pass-through: the client adds, removes,
 * or invents nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { browserAuthSession } from '../browser-auth-session';
import { QuantMailApiClient, __clearPendingOperationsForTests } from '../api-client';

function okResponse(body: unknown = { success: true, data: { id: 'draft-1' } }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** The JSON body the client sent on call N (0-based). */
function sentBody(spy: ReturnType<typeof vi.spyOn>, n: number): Record<string, unknown> {
  const init = spy.mock.calls[n]?.[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
}

/** The request URL the client sent on call N (0-based). */
function sentUrl(spy: ReturnType<typeof vi.spyOn>, n: number): string {
  return String(spy.mock.calls[n]?.[0] ?? '');
}

const baseCompose = () => ({
  to: [{ email: 'someone@example.com' }],
  subject: 's',
  bodyText: 'b',
});

describe('api-client send-as wire contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let client: QuantMailApiClient;

  beforeEach(() => {
    __clearPendingOperationsForTests();
    client = new QuantMailApiClient('http://localhost:1');
    fetchSpy = vi.spyOn(browserAuthSession, 'authenticatedFetch').mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __clearPendingOperationsForTests();
  });

  it('composeEmail carries a chosen sendAsId verbatim', async () => {
    await client.composeEmail({ ...baseCompose(), sendAsId: 'alias-1' });
    expect(sentBody(fetchSpy, 0)['sendAsId']).toBe('alias-1');
  });

  it('composeEmail carries an explicit null sendAsId (primary address)', async () => {
    await client.composeEmail({ ...baseCompose(), sendAsId: null });
    const body = sentBody(fetchSpy, 0);
    expect('sendAsId' in body).toBe(true);
    expect(body['sendAsId']).toBeNull();
  });

  it('composeEmail without sendAsId leaves the key absent (backend keeps the stored From)', async () => {
    await client.composeEmail(baseCompose());
    expect('sendAsId' in sentBody(fetchSpy, 0)).toBe(false);
  });

  it('updateDraft carries sendAsId verbatim on the PUT body', async () => {
    await client.updateDraft('draft-1', { ...baseCompose(), sendAsId: 'alias-1' });
    expect(sentUrl(fetchSpy, 0)).toContain('/emails/draft-1');
    expect(sentBody(fetchSpy, 0)['sendAsId']).toBe('alias-1');
  });

  it('updateDraft carries an explicit null sendAsId (revert-to-primary travels)', async () => {
    await client.updateDraft('draft-1', { ...baseCompose(), sendAsId: null });
    const body = sentBody(fetchSpy, 0);
    expect('sendAsId' in body).toBe(true);
    expect(body['sendAsId']).toBeNull();
  });

  it('send-as identity endpoints hit the real backend paths', async () => {
    await client.getSendAsIdentities();
    expect(sentUrl(fetchSpy, 0)).toContain('/settings/send-as');

    await client.addSendAsIdentity('kundan@other-domain.com', 'Kundan Alias');
    const addBody = sentBody(fetchSpy, 1);
    expect(addBody['email']).toBe('kundan@other-domain.com');
    expect(addBody['displayName']).toBe('Kundan Alias');

    await client.verifySendAsIdentity('alias-1', '123456');
    expect(sentUrl(fetchSpy, 2)).toContain('/settings/send-as/alias-1/verify');
    expect(sentBody(fetchSpy, 2)['code']).toBe('123456');

    await client.deleteSendAsIdentity('alias-1');
    expect(sentUrl(fetchSpy, 3)).toContain('/settings/send-as/alias-1');
  });
});
