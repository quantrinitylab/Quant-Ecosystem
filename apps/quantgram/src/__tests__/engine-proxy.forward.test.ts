// @vitest-environment node
// ============================================================================
// quantneon — Stage-4 engine proxy forward tests (Task 12.3 / DoD-3, Req 8.5)
// ============================================================================
//
// Verifies the Next App Router proxy handlers (Layer 4 of the integration seam)
// for one ar-lenses surface, one federation surface and the feed surface forward
// method + body/query to the quantneon backend URL and propagate the
// `Authorization` bearer + an `x-request-id` (minting one when absent), relaying
// the backend status. Global `fetch` is mocked; we assert on the
// URL/headers/body the shared `@quant/api-client` `proxyToBackend` utility (used
// by every quantneon `_lib/*-proxy.ts` helper) passes to the backend.
//
// Subjects under test:
//   - ar-lenses:  app/api/ar-lenses/lenses/generate/route.ts  POST -> /ar-lenses/lenses/generate
//   - federation: app/api/federation/instances/block/route.ts POST -> /federation/instances/block
//   - feed:       app/api/feed/route.ts                        GET  -> /feed?<query>
//                 app/api/feed/candidates/route.ts             POST -> /feed/candidates
//
// All quantneon proxy helpers default the backend origin to
// http://localhost:3012 (the quantneon backend PORT — Requirement 1.6) when
// NEXT_PUBLIC_QUANTNEON_BACKEND_URL is unset. `proxyToBackend` returns 502
// unless the backend response is application/json, so the fetch mock sets that
// content-type.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as arGeneratePost } from '../app/api/ar-lenses/lenses/generate/route';
import { POST as federationBlockPost } from '../app/api/federation/instances/block/route';
import { GET as feedGet } from '../app/api/feed/route';
import { POST as feedCandidatesPost } from '../app/api/feed/candidates/route';

const BACKEND = 'http://localhost:3012';

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

describe('ar-lenses proxy forward: POST /api/ar-lenses/lenses/generate', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(201, { success: true, data: { lens: { id: 'lens-1' } } });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards method + body to the backend and propagates bearer + provided x-request-id', async () => {
    const body = { prompt: 'neon cat ears', style: 'glam', intensity: 0.7 };
    const req = new NextRequest('http://localhost:3000/api/ar-lenses/lenses/generate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ar-token-abc',
        'x-request-id': 'req-ar-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await arGeneratePost(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/ar-lenses/lenses/generate`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer ar-token-abc');
    expect(headers['x-request-id']).toBe('req-ar-123');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });

  it('mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/ar-lenses/lenses/generate', {
      method: 'POST',
      headers: { authorization: 'Bearer ar-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x' }),
    });

    await arGeneratePost(req);

    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/ar-lenses/lenses/generate', {
      method: 'POST',
      headers: { authorization: 'Bearer ar-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x' }),
    });

    const res = await arGeneratePost(req);
    expect(res.status).toBe(403);
  });
});

describe('federation proxy forward: POST /api/federation/instances/block', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(201, {
      success: true,
      data: { domain: 'spam.example', blocked: true },
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards method + body to the backend and propagates bearer + provided x-request-id', async () => {
    const body = { domain: 'spam.example' };
    const req = new NextRequest('http://localhost:3000/api/federation/instances/block', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fed-token-abc',
        'x-request-id': 'req-fed-456',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await federationBlockPost(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/federation/instances/block`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer fed-token-abc');
    expect(headers['x-request-id']).toBe('req-fed-456');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });

  it('mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/federation/instances/block', {
      method: 'POST',
      headers: { authorization: 'Bearer fed-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'spam.example' }),
    });

    await federationBlockPost(req);

    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/federation/instances/block', {
      method: 'POST',
      headers: { authorization: 'Bearer fed-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'spam.example' }),
    });

    const res = await federationBlockPost(req);
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

  it('GET /feed forwards method + query string to the backend and propagates bearer + x-request-id', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/feed?feedId=neon-feed-1&page=1&pageSize=10',
      {
        method: 'GET',
        headers: { authorization: 'Bearer feed-token-abc', 'x-request-id': 'req-feed-789' },
      },
    );

    const res = await feedGet(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    // Query string forwarded to the backend feed route.
    expect(url).toBe(`${BACKEND}/feed?feedId=neon-feed-1&page=1&pageSize=10`);
    expect(init.method).toBe('GET');
    expect(headers['Authorization']).toBe('Bearer feed-token-abc');
    expect(headers['x-request-id']).toBe('req-feed-789');
    expect(res.status).toBe(200);
  });

  it('GET /feed mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/feed?feedId=neon-feed-1', {
      method: 'GET',
      headers: { authorization: 'Bearer feed-token-abc' },
    });

    await feedGet(req);

    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('POST /feed/candidates forwards the body to the backend and propagates bearer + x-request-id', async () => {
    fetchMock = makeFetchMock(201, { success: true, data: { feedId: 'neon-feed-1', poolSize: 2 } });
    vi.stubGlobal('fetch', fetchMock);

    const body = {
      feedId: 'neon-feed-1',
      items: [{ id: 'p1', authorId: 'a1', upvotes: 5 }],
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

    const req = new NextRequest('http://localhost:3000/api/feed?feedId=neon-feed-1', {
      method: 'GET',
      headers: { authorization: 'Bearer feed-token-abc' },
    });

    const res = await feedGet(req);
    expect(res.status).toBe(403);
  });
});
