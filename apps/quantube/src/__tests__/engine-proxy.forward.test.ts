// @vitest-environment node
// ============================================================================
// quantube — Stage-5 engine proxy forward tests (Task 13.3 / DoD-3, Req 8.5)
// ============================================================================
//
// Verifies the Next App Router proxy handlers (Layer 4 of the integration seam)
// for one surface per engine group (media / feed / payments) forward method +
// body/query to the quantube backend URL and propagate the `Authorization`
// bearer + an `x-request-id` (minting one when absent), relaying the backend
// status. Global `fetch` is mocked; we assert on the URL/headers/body the
// shared `@quant/api-client` `proxyToBackend` utility (used by every quantube
// `_lib/engine-proxy.ts` helper) passes to the backend.
//
// Subjects under test:
//   - media:    app/api/media/library/route.ts        POST -> /media/library
//   - feed:     app/api/feed/route.ts                  GET  -> /feed?<query>
//               app/api/feed/candidates/route.ts       POST -> /feed/candidates
//   - payments: app/api/payments/intents/route.ts      POST -> /payments/intents
//               app/api/payments/config/route.ts        GET  -> /payments/config
//
// All quantube proxy helpers default the backend origin to
// http://localhost:3006 (the quantube backend PORT — Requirement 1.6) when
// NEXT_PUBLIC_QUANTUBE_BACKEND_URL is unset. `proxyToBackend` returns 502 unless
// the backend response is application/json, so the fetch mock sets that
// content-type.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as mediaLibraryGet, POST as mediaLibraryPost } from '../app/api/media/library/route';
import { GET as feedGet } from '../app/api/feed/route';
import { POST as feedCandidatesPost } from '../app/api/feed/candidates/route';
import { POST as paymentsIntentsPost } from '../app/api/payments/intents/route';
import { GET as paymentsConfigGet } from '../app/api/payments/config/route';

const BACKEND = 'http://localhost:3006';

function makeFetchMock(status = 200, payload: unknown = { success: true, data: {} }) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function lastFetchCall(fetchMock: ReturnType<typeof makeFetchMock>) {
  const call = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit & { headers: Record<string, string> },
  ];
  const url = call[0];
  const init = call[1];
  return { url, init, headers: init.headers as Record<string, string> };
}

describe('media proxy forward: POST /api/media/library', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(201, { success: true, data: { item: { id: 'm-1' } } });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards method + body to the backend and propagates bearer + provided x-request-id', async () => {
    const body = {
      type: 'video',
      url: 'https://cdn.example/clip.mp4',
      name: 'clip.mp4',
      size: 1024,
      mimeType: 'video/mp4',
      sourceApp: 'quantube',
    };
    const req = new NextRequest('http://localhost:3000/api/media/library', {
      method: 'POST',
      headers: {
        authorization: 'Bearer media-token-abc',
        'x-request-id': 'req-media-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await mediaLibraryPost(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/media/library`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer media-token-abc');
    expect(headers['x-request-id']).toBe('req-media-123');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });

  it('mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/media/library', {
      method: 'POST',
      headers: { authorization: 'Bearer media-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'image', url: 'u', name: 'n', size: 1, mimeType: 'image/png' }),
    });

    await mediaLibraryPost(req);

    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('GET /api/media/library forwards the query string + bearer + x-request-id', async () => {
    fetchMock = makeFetchMock(200, { success: true, data: { items: [], storage: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/media/library?maxItems=10&type=video', {
      method: 'GET',
      headers: { authorization: 'Bearer media-token-abc', 'x-request-id': 'req-media-ls' },
    });

    const res = await mediaLibraryGet(req);

    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/media/library?maxItems=10&type=video`);
    expect(init.method).toBe('GET');
    expect(headers['Authorization']).toBe('Bearer media-token-abc');
    expect(headers['x-request-id']).toBe('req-media-ls');
    expect(res.status).toBe(200);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/media/library', {
      method: 'POST',
      headers: { authorization: 'Bearer media-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'image', url: 'u', name: 'n', size: 1, mimeType: 'image/png' }),
    });

    const res = await mediaLibraryPost(req);
    expect(res.status).toBe(403);
  });
});

describe('feed proxy forward: GET /api/feed (composed feed) + POST /api/feed/candidates', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(200, {
      success: true,
      data: { items: [], algorithmUsed: 'chrono', retrievalCount: 0 },
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('GET /feed forwards method + query string and propagates bearer + x-request-id', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/feed?feedId=tube-feed-1&page=1&pageSize=10',
      {
        method: 'GET',
        headers: { authorization: 'Bearer feed-token-abc', 'x-request-id': 'req-feed-789' },
      },
    );

    const res = await feedGet(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/feed?feedId=tube-feed-1&page=1&pageSize=10`);
    expect(init.method).toBe('GET');
    expect(headers['Authorization']).toBe('Bearer feed-token-abc');
    expect(headers['x-request-id']).toBe('req-feed-789');
    expect(res.status).toBe(200);
  });

  it('GET /feed mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/feed?feedId=tube-feed-1', {
      method: 'GET',
      headers: { authorization: 'Bearer feed-token-abc' },
    });

    await feedGet(req);

    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('POST /feed/candidates forwards the body and propagates bearer + x-request-id', async () => {
    fetchMock = makeFetchMock(201, { success: true, data: { feedId: 'tube-feed-1', poolSize: 2 } });
    vi.stubGlobal('fetch', fetchMock);

    const body = {
      feedId: 'tube-feed-1',
      items: [{ id: 'v1', authorId: 'a1', upvotes: 5 }],
      replace: true,
    };
    const req = new NextRequest('http://localhost:3000/api/feed/candidates', {
      method: 'POST',
      headers: {
        authorization: 'Bearer feed-token-abc',
        'x-request-id': 'req-cand-001',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await feedCandidatesPost(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/feed/candidates`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer feed-token-abc');
    expect(headers['x-request-id']).toBe('req-cand-001');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/feed?feedId=tube-feed-1', {
      method: 'GET',
      headers: { authorization: 'Bearer feed-token-abc' },
    });

    const res = await feedGet(req);
    expect(res.status).toBe(403);
  });
});

describe('payments proxy forward: POST /api/payments/intents + GET /api/payments/config', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(201, {
      success: true,
      data: { id: 'pi_1', clientSecret: 'cs_1', status: 'requires_payment_method' },
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POST /payments/intents forwards method + body and propagates bearer + provided x-request-id', async () => {
    const body = { amount: 500, currency: 'usd' };
    const req = new NextRequest('http://localhost:3000/api/payments/intents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer pay-token-abc',
        'x-request-id': 'req-pay-456',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await paymentsIntentsPost(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/payments/intents`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer pay-token-abc');
    expect(headers['x-request-id']).toBe('req-pay-456');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });

  it('POST /payments/intents mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/payments/intents', {
      method: 'POST',
      headers: { authorization: 'Bearer pay-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 100, currency: 'usd' }),
    });

    await paymentsIntentsPost(req);

    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('GET /payments/config forwards method + bearer + x-request-id and relays status', async () => {
    fetchMock = makeFetchMock(200, { success: true, data: { testMode: true } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/payments/config', {
      method: 'GET',
      headers: { authorization: 'Bearer pay-token-abc', 'x-request-id': 'req-cfg-1' },
    });

    const res = await paymentsConfigGet(req);

    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/payments/config`);
    expect(init.method).toBe('GET');
    expect(headers['Authorization']).toBe('Bearer pay-token-abc');
    expect(headers['x-request-id']).toBe('req-cfg-1');
    expect(res.status).toBe(200);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/payments/config', {
      method: 'GET',
      headers: { authorization: 'Bearer pay-token-abc' },
    });

    const res = await paymentsConfigGet(req);
    expect(res.status).toBe(403);
  });
});
