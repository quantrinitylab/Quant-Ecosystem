// @vitest-environment node
// The thread Summarize card posts to /api/ai/summarize-thread. On staging the
// ingress rewrites /api/* to the backend root, so the backend sees
// /ai/summarize-thread. The Next route must forward to that SAME path so local
// dev exercises the registration production reaches (it used to forward to
// /api/v1/ai/summarize-thread, which hid the staging 404).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/ai/summarize-thread/route';

const BACKEND = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';

describe('POST /api/ai/summarize-thread (Next proxy)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { summary: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards to the root /ai/summarize-thread path the ingress uses', async () => {
    const messages = [{ from: 'a@quantmail.in', subject: 'Hi', body: 'Hello' }];
    const req = new NextRequest('http://localhost:3000/api/ai/summarize-thread', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BACKEND}/ai/summarize-thread`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ messages });
  });
});
