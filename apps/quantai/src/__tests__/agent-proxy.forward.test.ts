// ============================================================================
// quantai — agent proxy forward test (Task 10.4 / DoD-3 & Requirement 8.5)
// ============================================================================
//
// Verifies the Next App Router proxy handler for an agent surface (Layer 4 of
// the integration seam) forwards method + body to the backend URL and propagates
// the `authorization` bearer and an `x-request-id` (minting one when absent),
// relaying the backend status. We mock global `fetch` and assert on the URL and
// headers the proxy passes to the backend.
//
// Subject under test: app/api/agents/runtime/tasks/route.ts POST handler, which
// forwards to the quantai backend POST /agents/runtime/tasks via the shared
// `proxyToBackend` utility (`@quant/api-client`).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/agents/runtime/tasks/route';

const BACKEND = 'http://localhost:3004';

function makeFetchMock(status = 201, payload: unknown = { success: true, data: { id: 't1' } }) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function lastFetchCall(fetchMock: ReturnType<typeof makeFetchMock>) {
  const call = fetchMock.mock.calls[0];
  if (!call) {
    throw new Error('expected fetch to have been called at least once');
  }
  const url = String(call[0]);
  const init = (call[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url, init, headers: init.headers as Record<string, string> };
}

describe('agent proxy forward: POST /api/agents/runtime/tasks', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards method + body to the backend URL and propagates the bearer + provided x-request-id', async () => {
    const body = { task: 'do the thing' };
    const req = new NextRequest('http://localhost:3000/api/agents/runtime/tasks', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token-abc',
        'x-request-id': 'req-provided-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await POST(req);

    // Backend was called exactly once at the right URL with POST.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/agents/runtime/tasks`);
    expect(init.method).toBe('POST');

    // Bearer + the inbound x-request-id are propagated verbatim.
    expect(headers['Authorization']).toBe('Bearer test-token-abc');
    expect(headers['x-request-id']).toBe('req-provided-123');

    // Body is forwarded as JSON.
    expect(JSON.parse(init.body as string)).toEqual(body);

    // Status is relayed from the backend.
    expect(res.status).toBe(201);
  });

  it('mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents/runtime/tasks', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token-abc',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: 'mint id' }),
    });

    await POST(req);

    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/agents/runtime/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'denied' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
