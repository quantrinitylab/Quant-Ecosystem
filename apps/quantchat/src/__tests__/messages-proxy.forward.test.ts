// @vitest-environment node
// ============================================================================
// quantchat — messages proxy forward tests (QC-F-286)
// ============================================================================
//
// `GET /api/messages/:id` used to hand-forward to backend `/messages/:id`,
// a route that DOES NOT EXIST (backend messages routes are mounted only
// under `/conversations`; the list route is `GET /conversations/:id/messages`).
// Every call — including the chat-socket HTTP polling fallback — 404'd.
// These tests pin the retargeted GET: it must go through the shared proxy to
// the REAL backend path, forward the bearer + query, and relay status/body
// verbatim. Global fetch mocked (channels-proxy.forward.test.ts pattern).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as messagesGet } from '../app/api/messages/[id]/route';

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

function call(fetchMock: ReturnType<typeof jsonFetch>, idx = 0) {
  const c = fetchMock.mock.calls[idx]!;
  const init = (c[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url: String(c[0]), init, headers: init.headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('messages proxy GET (QC-F-286)', () => {
  it('forwards to the REAL backend list route /conversations/:id/messages', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { data: [{ id: 'm1' }], total: 1, page: 1, pageSize: 25 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest(
      'http://localhost:3000/api/messages/conv-1?pageSize=25',
      { method: 'GET', headers: { authorization: 'Bearer tok' } },
    );
    const res = await messagesGet(req, { params: Promise.resolve({ id: 'conv-1' }) });
    expect(res.status).toBe(200);
    const { url, headers } = call(fetchMock);
    // NOT `${BACKEND}/messages/conv-1` — that backend route does not exist.
    expect(url).toBe(`${BACKEND}/conversations/conv-1/messages?pageSize=25`);
    expect(headers['Authorization']).toBe('Bearer tok');
    const body = (await res.json()) as { data: { data: Array<{ id: string }> } };
    expect(body.data.data).toEqual([{ id: 'm1' }]);
  });

  it('relays a backend 403 NOT_A_MEMBER verbatim', async () => {
    const fetchMock = jsonFetch(403, {
      success: false,
      error: { code: 'NOT_A_MEMBER', message: 'Not a member', statusCode: 403 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/conv-9', {
      method: 'GET',
      headers: { authorization: 'Bearer tok' },
    });
    const res = await messagesGet(req, { params: Promise.resolve({ id: 'conv-9' }) });
    expect(res.status).toBe(403);
    expect(call(fetchMock).url).toBe(`${BACKEND}/conversations/conv-9/messages`);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_A_MEMBER');
  });

  it('relays a backend 401 verbatim (no auth header -> no SSO exchange)', async () => {
    const fetchMock = jsonFetch(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/conv-1', {
      method: 'GET',
    });
    const res = await messagesGet(req, { params: Promise.resolve({ id: 'conv-1' }) });
    expect(res.status).toBe(401);
    expect(call(fetchMock).url).toBe(`${BACKEND}/conversations/conv-1/messages`);
  });
});
