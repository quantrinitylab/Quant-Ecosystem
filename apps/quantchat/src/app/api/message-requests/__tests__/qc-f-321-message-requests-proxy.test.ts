// @vitest-environment node
// ============================================================================
// QC-F-321 — message-requests Next proxy forward tests
// ============================================================================
// The five proxy handlers must forward method + Authorization + body to
// the real backend /message-requests routes and relay status + body
// verbatim — the new-chat composer's whole flow keys off the backend's
// error CODE reaching the client untouched, and a dead backend must
// surface the proxy's honest 503, never a fabricated empty inbox.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createPost } from '../route';
import { GET as inboxGet } from '../inbox/route';
import { GET as sentGet } from '../sent/route';
import { POST as acceptPost } from '../[id]/accept/route';
import { POST as declinePost } from '../[id]/decline/route';

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

describe('QC-F-321 message-requests proxy', () => {
  it('P1. POST /api/message-requests forwards body + Authorization and relays 201 verbatim', async () => {
    const payload = { success: true, data: { id: 'req_1', status: 'PENDING' } };
    const fetchMock = jsonFetch(201, payload);
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/message-requests', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify({ targetId: 'user_t', message: 'salaam' }),
    });
    const res = await createPost(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(payload);
    const { url, init, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/message-requests`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer <redacted>');
    expect(JSON.parse(String(init.body))).toEqual({ targetId: 'user_t', message: 'salaam' });
  });

  it('P2. accept forwards the id (URL-encoded) into the backend path', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { conversationId: 'conv_1' } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/message-requests/a%2Fb/accept', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await acceptPost(req, { params: Promise.resolve({ id: 'a/b' }) });
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/message-requests/a%2Fb/accept`);
  });

  it('P3. GET inbox forwards query params to the backend', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: [] });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/message-requests/inbox?limit=50', {
      method: 'GET',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await inboxGet(req);
    expect(res.status).toBe(200);
    const { url } = call(fetchMock);
    expect(url.startsWith(`${BACKEND}/message-requests/inbox`)).toBe(true);
    expect(url).toContain('limit=50');

    const fetchMock2 = jsonFetch(200, { success: true, data: [] });
    vi.stubGlobal('fetch', fetchMock2);
    const res2 = await sentGet(
      new NextRequest('http://localhost:3000/api/message-requests/sent', { method: 'GET' }),
    );
    expect(res2.status).toBe(200);
    expect(call(fetchMock2).url).toBe(`${BACKEND}/message-requests/sent`);
  });

  it("P4. a backend 403's status and error code relay untouched (the composer keys off the code)", async () => {
    const payload = {
      success: false,
      error: { code: 'MESSAGE_NOT_ALLOWED', message: 'This user is not accepting new messages', statusCode: 403 },
    };
    const fetchMock = jsonFetch(403, payload);
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/message-requests', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify({ targetId: 'user_t', message: 'salaam' }),
    });
    const res = await createPost(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(payload);
  });

  it('P5. backend unreachable -> honest 503 UPSTREAM_UNAVAILABLE, no fabricated inbox', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/message-requests/inbox', {
      method: 'GET',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await inboxGet(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('P6. decline forwards to the backend decline path', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { request: { status: 'DECLINED' } } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/message-requests/req_9/decline', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await declinePost(req, { params: Promise.resolve({ id: 'req_9' }) });
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/message-requests/req_9/decline`);
  });
});
