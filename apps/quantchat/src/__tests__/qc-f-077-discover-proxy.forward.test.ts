// @vitest-environment node
// ============================================================================
// quantchat — discover proxy forward tests (QC-F-077)
// ============================================================================
// The /discover page's apiClient calls used to die at the Next layer: no
// /api/discover* route existed at all. These tests verify the new App
// Router handlers forward method + Authorization + query to the real
// backend /discover* routes and relay the status verbatim.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as feedGet } from '../app/api/discover/route';
import { GET as trendingGet } from '../app/api/discover/trending/route';
import { GET as publishersGet } from '../app/api/discover/publishers/route';
import { POST as subscribePost } from '../app/api/discover/publishers/[id]/subscribe/route';

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

describe('discover proxy (QC-F-077)', () => {
  it('GET /api/discover forwards Bearer + category query to backend /discover', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: [] });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/discover?category=news', {
      method: 'GET',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await feedGet(req);
    expect(res.status).toBe(200);
    const { url, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/discover?category=news`);
    expect(headers['Authorization']).toBe('Bearer <redacted>');
  });

  it('GET /api/discover/trending forwards to backend /discover/trending', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: [] });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/discover/trending', { method: 'GET' });
    const res = await trendingGet(req);
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/discover/trending`);
  });

  it('GET /api/discover/publishers forwards to backend /discover/publishers', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: [] });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/discover/publishers', { method: 'GET' });
    const res = await publishersGet(req);
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/discover/publishers`);
  });

  it('POST /api/discover/publishers/:id/subscribe forwards to the backend subscribe route', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { subscribed: true, alreadySubscribed: false, subscriberCount: 4 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/discover/publishers/ch-1/subscribe', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await subscribePost(req, { params: Promise.resolve({ id: 'ch-1' }) });
    expect(res.status).toBe(200);
    const { url, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/discover/publishers/ch-1/subscribe`);
    expect(headers['Authorization']).toBe('Bearer <redacted>');
  });

  it('relays a backend 404 for an unknown publisher verbatim', async () => {
    const fetchMock = jsonFetch(404, {
      success: false,
      error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/discover/publishers/nope/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await subscribePost(req, { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});
