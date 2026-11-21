// @vitest-environment node
// ============================================================================
// QuantChat — calls proxy routes (QC-F-129)
// ============================================================================
//
// Before QC-F-129 the web's endCall()/joinCall()/initiate1v1Call() posted to
// /api/calls/* paths that had NO Next proxy — the calls family had exactly
// one proxy (history). These tests pin the four new proxies: they must hit
// the REAL backend routes, forward the bearer, and relay the backend's
// status + envelope verbatim. An unreachable backend must surface an honest
// 503 — never a fabricated 'Call ended'. Global fetch mocked (the
// messages-proxy.forward.test.ts pattern).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as endPost } from '../app/api/calls/[callId]/end/route';
import { POST as leavePost } from '../app/api/calls/[callId]/leave/route';
import { POST as joinPost } from '../app/api/calls/[callId]/join/route';
import { POST as initiatePost } from '../app/api/calls/initiate/route';

const BACKEND = 'http://localhost:3002';
const BEARER = 'Bearer <redacted>';

function jsonFetch(status: number, payload: unknown) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function throwingFetch() {
  return vi.fn(async () => {
    throw new Error('connect ECONNREFUSED');
  });
}

function call(fetchMock: ReturnType<typeof jsonFetch>, idx = 0) {
  const c = fetchMock.mock.calls[idx]!;
  const init = (c[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url: String(c[0]), init, headers: init.headers };
}

function postReq(path: string, withAuth = true) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: withAuth ? { authorization: BEARER } : {},
  });
}

const params = (callId: string) => ({ params: Promise.resolve({ callId }) });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('calls proxies (QC-F-129)', () => {
  it('end: POSTs to the REAL backend route /calls/:id/end with the bearer and relays 200 verbatim', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { message: 'Call ended' } });
    vi.stubGlobal('fetch', fetchMock);
    const res = await endPost(postReq('/api/calls/call-1/end'), params('call-1'));
    expect(res.status).toBe(200);
    const { url, init, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/calls/call-1/end`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe(BEARER);
    expect(JSON.parse(init.body as string)).toEqual({});
    const body = (await res.json()) as { data: { message: string } };
    expect(body.data.message).toBe('Call ended');
  });

  it('end: an unreachable backend yields an honest 503 — never a fake "Call ended"', async () => {
    const fetchMock = throwingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const res = await endPost(postReq('/api/calls/call-1/end'), params('call-1'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CALLS_UNAVAILABLE');
  });

  it('end: relays a backend 403 CALL_NOT_PARTICIPANT verbatim', async () => {
    const fetchMock = jsonFetch(403, {
      success: false,
      error: { code: 'CALL_NOT_PARTICIPANT', message: 'Not a participant', statusCode: 403 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await endPost(postReq('/api/calls/call-1/end'), params('call-1'));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'CALL_NOT_PARTICIPANT',
    );
  });

  it('leave: POSTs to /calls/:id/leave with the bearer and relays 200', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { message: 'Left call' } });
    vi.stubGlobal('fetch', fetchMock);
    const res = await leavePost(postReq('/api/calls/call-2/leave'), params('call-2'));
    expect(res.status).toBe(200);
    const { url, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/calls/call-2/leave`);
    expect(headers['Authorization']).toBe(BEARER);
  });

  it('join: POSTs to /calls/:id/join and relays the token envelope', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { token: 'tok-1', serverUrl: 'wss://livekit.test' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await joinPost(postReq('/api/calls/call-3/join'), params('call-3'));
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/calls/call-3/join`);
    const body = (await res.json()) as { data: { token: string; serverUrl: string } };
    expect(body.data.token).toBe('tok-1');
    expect(body.data.serverUrl).toBe('wss://livekit.test');
  });

  it('initiate: forwards the JSON body to POST /calls/initiate and relays 201', async () => {
    const fetchMock = jsonFetch(201, {
      success: true,
      data: { callId: 'call-9', roomName: 'chat-call:call-9' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/calls/initiate', {
      method: 'POST',
      headers: { authorization: BEARER, 'content-type': 'application/json' },
      body: JSON.stringify({ calleeId: 'user-b', conversationId: 'conv-1' }),
    });
    const res = await initiatePost(req);
    expect(res.status).toBe(201);
    const { url, init } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/calls/initiate`);
    expect(JSON.parse(init.body as string)).toEqual({
      calleeId: 'user-b',
      conversationId: 'conv-1',
    });
  });

  it('initiate: invalid JSON body is a 400, not a backend call', async () => {
    const fetchMock = jsonFetch(200, { success: true });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/calls/initiate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await initiatePost(req);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'CALLS_BAD_REQUEST',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('static-vs-dynamic pin: the initiate handler targets exactly /calls/initiate (never /calls/initiate/<suffix>)', async () => {
    // Next resolves the STATIC segment /api/calls/initiate before the
    // DYNAMIC [callId] routes, so POST /api/calls/initiate can never land in
    // the [callId] handlers. This pins the handler side of that contract:
    // the initiate route forwards to the bare backend path.
    const fetchMock = jsonFetch(201, { success: true, data: {} });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/calls/initiate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ calleeId: 'user-b', conversationId: 'conv-1' }),
    });
    await initiatePost(req);
    expect(call(fetchMock).url).toBe(`${BACKEND}/calls/initiate`);
  });

  it('a backend 503 stays a 503 on join (no phantom success anywhere in the family)', async () => {
    const fetchMock = jsonFetch(503, {
      success: false,
      error: { code: 'CALLS_UNAVAILABLE', message: 'down', statusCode: 503 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await joinPost(postReq('/api/calls/call-4/join'), params('call-4'));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { success: boolean }).success).toBe(false);
  });
});
