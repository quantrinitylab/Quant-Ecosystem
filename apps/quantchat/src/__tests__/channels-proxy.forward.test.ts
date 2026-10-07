// @vitest-environment node
// ============================================================================
// quantchat — channels proxy forward tests (PR-B: channel fan-out UI)
// ============================================================================
//
// Verifies the Next App Router `/api/channels*` handlers forward method + body
// + Authorization bearer to the backend `/channels*` routes and relay status.
// The backend is authoritative for publish authorization (403 for a read-only
// subscriber); we assert the proxy relays that verbatim. Global fetch mocked.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listGet, POST as createPost } from '../app/api/channels/route';
import { GET as feedGet } from '../app/api/channels/[id]/messages/route';
import { POST as subscribePost } from '../app/api/channels/[id]/subscribe/route';
import { POST as publishPost } from '../app/api/channels/[id]/publish/route';

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

describe('channels proxy', () => {
  it('GET /api/channels forwards the bearer to backend /channels', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: [] });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/channels', {
      method: 'GET',
      headers: { authorization: 'Bearer t' },
    });
    const res = await listGet(req);
    expect(res.status).toBe(200);
    const { url, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/channels`);
    expect(headers['Authorization']).toBe('Bearer t');
  });

  it('POST /api/channels forwards the create body', async () => {
    const fetchMock = jsonFetch(201, { success: true, data: { id: 'c1' } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/channels', {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'News' }),
    });
    const res = await createPost(req);
    expect(res.status).toBe(201);
    const { url, init } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/channels`);
    expect(JSON.parse(init.body as string)).toEqual({ name: 'News' });
  });

  it('GET /api/channels/:id/messages forwards to the backend feed', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: [] });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/channels/c1/messages', {
      method: 'GET',
    });
    const res = await feedGet(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/channels/c1/messages`);
  });

  it('POST /api/channels/:id/subscribe forwards to the backend', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { subscribed: true } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/channels/c1/subscribe', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
    });
    const res = await subscribePost(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/channels/c1/subscribe`);
  });

  it('relays a 403 CHANNEL_POST_FORBIDDEN from publish (read-only subscriber)', async () => {
    const fetchMock = jsonFetch(403, {
      success: false,
      error: { code: 'CHANNEL_POST_FORBIDDEN', message: 'Only admins can post', statusCode: 403 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/channels/c1/publish', {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    });
    const res = await publishPost(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CHANNEL_POST_FORBIDDEN');
  });
});
