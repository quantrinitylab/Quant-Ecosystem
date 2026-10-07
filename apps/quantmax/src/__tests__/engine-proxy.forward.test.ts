// @vitest-environment node
// ============================================================================
// quantmax — Stage-6 engine proxy forward tests (Task 14.5 / DoD-3, Req 8.5)
// ============================================================================
//
// Verifies the Next App Router proxy handlers (Layer 4 of the integration seam)
// for one payments surface, one commerce surface and the feed surface forward
// method + body/query to the quantmax backend URL and propagate the
// `Authorization` bearer + an `x-request-id` (minting one when absent), relaying
// the backend status. Global `fetch` is mocked; we assert on the
// URL/headers/body the shared `@quant/api-client` `proxyToBackend` utility (used
// by every quantmax `_lib/*-proxy.ts` helper) passes to the backend.
//
// All quantmax proxy helpers default the backend origin to http://localhost:3008
// (the quantmax backend PORT — Requirement 1.6) when NEXT_PUBLIC_QUANTMAX_BACKEND_URL
// is unset. `proxyToBackend` returns 502 unless the backend response is
// application/json, so the fetch mock sets that content-type.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as paymentsIntentsPost } from '../app/api/payments/intents/route';
import { POST as commerceOrdersPost } from '../app/api/commerce/orders/route';
import { GET as feedGet } from '../app/api/feed/route';

const BACKEND = 'http://localhost:3008';

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

describe('payments proxy forward: POST /api/payments/intents', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(201, { success: true, data: { id: 'pi_1' } });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards method + body and propagates bearer + provided x-request-id', async () => {
    const body = { amount: 500, currency: 'usd' };
    const req = new NextRequest('http://localhost:3000/api/payments/intents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer pay-token-abc',
        'x-request-id': 'req-pay-123',
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
    expect(headers['x-request-id']).toBe('req-pay-123');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });

  it('mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/payments/intents', {
      method: 'POST',
      headers: { authorization: 'Bearer pay-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 500, currency: 'usd' }),
    });
    await paymentsIntentsPost(req);
    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/payments/intents', {
      method: 'POST',
      headers: { authorization: 'Bearer pay-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 500, currency: 'usd' }),
    });
    const res = await paymentsIntentsPost(req);
    expect(res.status).toBe(403);
  });
});

describe('commerce proxy forward: POST /api/commerce/orders', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(201, { success: true, data: { order: { id: 'order-1' } } });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards method + body and propagates bearer + provided x-request-id', async () => {
    const body = { merchantOrderId: 'm-order-1', merchant: 'amazon', items: ['sku-1'] };
    const req = new NextRequest('http://localhost:3000/api/commerce/orders', {
      method: 'POST',
      headers: {
        authorization: 'Bearer com-token-abc',
        'x-request-id': 'req-com-456',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await commerceOrdersPost(req);

    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/commerce/orders`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer com-token-abc');
    expect(headers['x-request-id']).toBe('req-com-456');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });

  it('mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/commerce/orders', {
      method: 'POST',
      headers: { authorization: 'Bearer com-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ merchantOrderId: 'm', merchant: 'amazon', items: ['s'] }),
    });
    await commerceOrdersPost(req);
    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });
});

describe('feed proxy forward: GET /api/feed (composed feed)', () => {
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

  it('forwards method + query string and propagates bearer + x-request-id', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/feed?feedId=max-feed-1&page=1&pageSize=10',
      {
        method: 'GET',
        headers: { authorization: 'Bearer feed-token-abc', 'x-request-id': 'req-feed-789' },
      },
    );

    const res = await feedGet(req);

    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/feed?feedId=max-feed-1&page=1&pageSize=10`);
    expect(init.method).toBe('GET');
    expect(headers['Authorization']).toBe('Bearer feed-token-abc');
    expect(headers['x-request-id']).toBe('req-feed-789');
    expect(res.status).toBe(200);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(401, { success: false, error: { code: 'UNAUTHORIZED' } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/feed?feedId=max-feed-1', {
      method: 'GET',
      headers: {},
    });
    const res = await feedGet(req);
    expect(res.status).toBe(401);
  });
});
