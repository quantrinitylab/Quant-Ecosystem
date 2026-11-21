// @vitest-environment node
// ===========================================================================
// QC-F-101 — notifications Next proxy forward tests (case 20)
//
// The five new seam handlers (GET list, POST read-all, PATCH :id/read, plus
// the drive-by subscribe/settings forwards) are pure forwards: they must
// relay method + query + Authorization + body to the real backend
// /notifications routes and relay status + body verbatim. A backend 401 is
// never masked, and a dead backend surfaces the proxy's honest 503.
// ===========================================================================

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listGet } from '../route';
import { POST as readAllPost } from '../read-all/route';
import { PATCH as markReadPatch } from '../[id]/read/route';
import { POST as subscribePost } from '../subscribe/route';
import { GET as settingsGet, PUT as settingsPut } from '../settings/route';

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

function firstCall(fetchMock: ReturnType<typeof jsonFetch>) {
  const c = fetchMock.mock.calls[0]!;
  const init = (c[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url: String(c[0]), init, headers: init.headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('QC-F-101 notifications proxy (case 20)', () => {
  it('GET /api/notifications forwards query + Authorization and relays the backend 200 verbatim', async () => {
    const payload = {
      success: true,
      data: { notifications: [{ id: 'n1' }], unreadCount: 1, total: 1 },
    };
    const fetchMock = jsonFetch(200, payload);
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest(
      'http://localhost:3000/api/notifications?limit=5&sourceApp=quantchat',
      { headers: { authorization: 'Bearer <redacted>' } },
    );
    const res = await listGet(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);

    const { url, init, headers } = firstCall(fetchMock);
    const called = new URL(url);
    expect(`${called.origin}${called.pathname}`).toBe(`${BACKEND}/notifications`);
    expect(called.searchParams.get('limit')).toBe('5');
    expect(called.searchParams.get('sourceApp')).toBe('quantchat');
    expect(init.method).toBe('GET');
    expect(headers['Authorization']).toBe('Bearer <redacted>');
  });

  it('a backend 401 is relayed as 401, never masked (exchange cannot recover)', async () => {
    const backend401 = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token expired', statusCode: 401 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(backend401), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: { code: 'INVALID_SSO_TOKEN' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/notifications', {
      headers: { authorization: 'Bearer expired-native-token' },
    });
    const res = await listGet(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('a dead backend surfaces 503 UPSTREAM_UNAVAILABLE, never fabricated rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3002')),
    );

    const req = new NextRequest('http://localhost:3000/api/notifications');
    const res = await listGet(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({
      success: false,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Backend service is unavailable',
        statusCode: 503,
      },
    });
    expect(json.data).toBeUndefined();
  });

  it('POST /api/notifications/read-all forwards the POST and relays the count', async () => {
    const payload = { success: true, data: { updated: 3 } };
    const fetchMock = jsonFetch(200, payload);
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/notifications/read-all', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await readAllPost(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    const { url, init, headers } = firstCall(fetchMock);
    expect(url).toBe(`${BACKEND}/notifications/read-all`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer <redacted>');
  });

  it('PATCH /api/notifications/:id/read builds the backend path from params', async () => {
    const payload = { success: true, data: { id: 'n1', isRead: true } };
    const fetchMock = jsonFetch(200, payload);
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/notifications/n1/read', {
      method: 'PATCH',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await markReadPatch(req, { params: Promise.resolve({ id: 'n1' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(`${BACKEND}/notifications/n1/read`);
    expect(init.method).toBe('PATCH');
  });

  it('drive-by: POST /api/notifications/subscribe forwards body + Authorization', async () => {
    const payload = { success: true };
    const fetchMock = jsonFetch(201, payload);
    vi.stubGlobal('fetch', fetchMock);

    const sub = {
      subscription: {
        endpoint: 'https://push.example/e1',
        keys: { p256dh: 'p', auth: 'a' },
      },
    };
    const req = new NextRequest('http://localhost:3000/api/notifications/subscribe', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify(sub),
    });
    const res = await subscribePost(req);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(payload);
    const { url, init, headers } = firstCall(fetchMock);
    expect(url).toBe(`${BACKEND}/notifications/subscribe`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer <redacted>');
    expect(JSON.parse(String(init.body))).toEqual(sub);
  });

  it('drive-by: GET + PUT /api/notifications/settings forward to the backend', async () => {
    const getPayload = { success: true, data: { categories: { MESSAGES: true } } };
    const getFetch = jsonFetch(200, getPayload);
    vi.stubGlobal('fetch', getFetch);
    const getReq = new NextRequest('http://localhost:3000/api/notifications/settings', {
      headers: { authorization: 'Bearer <redacted>' },
    });
    const getRes = await settingsGet(getReq);
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual(getPayload);
    expect(firstCall(getFetch).url).toBe(`${BACKEND}/notifications/settings`);

    const putPayload = { success: true, data: { categories: { MESSAGES: false } } };
    const putFetch = jsonFetch(200, putPayload);
    vi.stubGlobal('fetch', putFetch);
    const putReq = new NextRequest('http://localhost:3000/api/notifications/settings', {
      method: 'PUT',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify({ categories: { MESSAGES: false } }),
    });
    const putRes = await settingsPut(putReq);
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual(putPayload);
    const { url, init } = firstCall(putFetch);
    expect(url).toBe(`${BACKEND}/notifications/settings`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ categories: { MESSAGES: false } });
  });
});
