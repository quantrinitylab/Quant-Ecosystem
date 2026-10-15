// @vitest-environment node
// ============================================================================
// QC-F-410 (QC-2b) — message-reactions Next proxy forward tests
// ============================================================================
// The shipped client's `apiClient.addReaction` POSTs /api/messages/:id/
// reactions; before QC-2 this proxy did not exist (the [id] folder held
// only route.ts + view-once/), so the call 404'd at the Next layer before
// it could ever reach the backend. The proxy must forward method +
// Authorization + body to the REAL backend route
// POST /conversations/messages/:id/reactions (the backend messages router
// is mounted under /conversations) and relay status + body verbatim —
// no fabricated success. Pattern: QC-F-321 proxy tests.
// Negative control (brief §6.3): on the original tree this file fails to
// load (the route module does not exist) — C1/C2 both FAIL.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../reactions/route';

const BACKEND = 'http://localhost:3002';

function jsonFetch(status: number, payload: unknown) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function call(fetchMock: ReturnType<typeof jsonFetch>) {
  const c = fetchMock.mock.calls[0]!;
  const init = (c[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url: String(c[0]), init, headers: init.headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('QC-F-410 QC-2b reactions proxy', () => {
  it('C1: POST /api/messages/:id/reactions forwards to backend POST /conversations/messages/:id/reactions with Authorization + body and relays 200 verbatim', async () => {
    const payload = {
      success: true,
      data: { id: 'msg-1', metadata: { reactions: { '👍': ['u-member'] } } },
    };
    const fetchMock = jsonFetch(200, payload);
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/msg-1/reactions', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify({ emoji: '👍' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    const { url, init, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/conversations/messages/msg-1/reactions`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer <redacted>');
    expect(JSON.parse(String(init.body))).toEqual({ emoji: '👍' });
  });

  it("C2: a backend 403 (NOT_A_MEMBER) relays untouched — status and error code verbatim, no fabricated success", async () => {
    const payload = {
      success: false,
      error: {
        code: 'NOT_A_MEMBER',
        message: 'User is not a member of this conversation',
        statusCode: 403,
      },
    };
    const fetchMock = jsonFetch(403, payload);
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/msg-1/reactions', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify({ emoji: '👍' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(payload);
  });
});
