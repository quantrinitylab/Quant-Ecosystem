// ============================================================================
// SMTP Inbound - Ingestion Handler tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createIngestionHandler, toIngestionPayload, type FetchLike } from './ingestion-handler.js';
import type { ParsedEmail } from './smtp-server.js';

function makeEmail(over: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    from: 'alice@example.com',
    to: ['bob@quantmail.io'],
    subject: 'Hello',
    html: '<p>hi</p>',
    text: 'hi',
    attachments: [],
    messageId: '<abc@example.com>',
    inReplyTo: null,
    date: new Date('2026-07-03T00:00:00.000Z'),
    ...over,
  };
}

function okResponse(): ReturnType<FetchLike> {
  return Promise.resolve({ ok: true, status: 200, text: async () => '' });
}

describe('toIngestionPayload', () => {
  it('serializes attachments as base64 and dates as ISO', () => {
    const payload = toIngestionPayload(
      makeEmail({
        attachments: [
          {
            filename: 'a.txt',
            contentType: 'text/plain',
            size: 3,
            content: Buffer.from('abc'),
          },
        ],
      }),
    );
    expect(payload.date).toBe('2026-07-03T00:00:00.000Z');
    expect(payload.attachments[0]!.contentBase64).toBe(Buffer.from('abc').toString('base64'));
  });

  it('emits null date when absent', () => {
    expect(toIngestionPayload(makeEmail({ date: null })).date).toBeNull();
  });
});

describe('createIngestionHandler', () => {
  it('fails closed when no webhook is configured', async () => {
    const fetchImpl = vi.fn<FetchLike>(okResponse);
    const handle = createIngestionHandler({ webhookUrl: undefined, fetchImpl });
    await expect(handle(makeEmail())).rejects.toThrow('INBOUND_WEBHOOK_NOT_CONFIGURED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs the payload to the webhook with JSON content-type', async () => {
    const fetchImpl = vi.fn<FetchLike>(okResponse);
    const handle = createIngestionHandler({ webhookUrl: 'https://ingest.local/hook', fetchImpl });
    await handle(makeEmail());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://ingest.local/hook');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers['authorization']).toBeUndefined();
    expect(JSON.parse(init.body).from).toBe('alice@example.com');
  });

  it('sends a bearer token when configured', async () => {
    const fetchImpl = vi.fn<FetchLike>(okResponse);
    const handle = createIngestionHandler({
      webhookUrl: 'https://ingest.local/hook',
      authToken: 'sekret',
      fetchImpl,
    });
    await handle(makeEmail());
    expect(fetchImpl.mock.calls[0]![1].headers['authorization']).toBe('Bearer sekret');
  });

  it('fails closed when the downstream rejects (non-2xx)', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    }));
    const handle = createIngestionHandler({ webhookUrl: 'https://ingest.local/hook', fetchImpl });
    await expect(handle(makeEmail())).rejects.toThrow(/INBOUND_INGESTION_FAILED status=503/);
  });
});
