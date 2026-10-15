/**
 * Quick-reply schedule-send (client half): `replyToEmail` carries the one
 * `sendAt` contract the composer already uses for POST /emails/:id/send.
 *
 * Pins:
 *   (a) an immediate reply posts WITHOUT a sendAt key — the immediate call
 *       stays byte-identical to before this change;
 *   (b) a scheduled reply posts the sendAt ISO string to /emails/:id/reply.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { browserAuthSession } from '../browser-auth-session';
import { QuantMailApiClient } from '../api-client';

function okResponse(body: unknown = { success: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('replyToEmail sendAt contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let client: QuantMailApiClient;

  beforeEach(() => {
    client = new QuantMailApiClient('http://localhost:1');
    fetchSpy = vi.spyOn(browserAuthSession, 'authenticatedFetch').mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastBody(): Record<string, unknown> {
    const init = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]?.[1] as {
      body?: string;
    };
    return JSON.parse(init?.body ?? '{}');
  }

  it('immediate reply: no sendAt key in the POST body (byte-identical to before)', async () => {
    await client.replyToEmail('msg-1', 'on it', undefined, 'chat', 'cid-1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:1/emails/msg-1/reply');
    const body = lastBody();
    expect(body).toMatchObject({
      body: 'on it',
      messageKind: 'chat',
      clientMessageId: 'cid-1',
    });
    expect('sendAt' in body).toBe(false);
  });

  it('scheduled reply: sendAt travels in the POST body', async () => {
    const at = new Date(Date.now() + 3_600_000).toISOString();
    await client.replyToEmail('msg-1', 'on it', undefined, 'chat', 'cid-1', at);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:1/emails/msg-1/reply');
    expect(lastBody().sendAt).toBe(at);
  });
});
