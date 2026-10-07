// @vitest-environment node
// ============================================================================
// quantube — proxy passthrough property test (Task 7.5)
// ============================================================================
//
// Feature: quantube-real-data-wiring, Property 11: proxyEngineRequest relays
// the backend status code unchanged and forwards bearer + x-request-id.
//
// Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6.
//
// Exercises the repointed Task-7 proxy route handlers (history, playlists list,
// playlist detail, watch-later list/add/remove) through the canonical
// `proxyEngineRequest` helper. Global `fetch` is mocked at the backend boundary
// (no backend boot); we assert the proxy:
//   - forwards the inbound bearer token to the backend (Req 7.2),
//   - forwards the inbound `x-request-id` to the backend (Req 7.3),
//   - relays the backend status code unchanged for 2xx AND 4xx/5xx (Req 7.4),
//   - relays the backend body byte-for-byte unchanged (Req 7.5),
//   - relays a 4xx/5xx error envelope verbatim (Req 7.6),
//   - makes NO authentication/authorization decision (forwards even with no /
//     an arbitrary bearer; never self-issues a 401/403) (Req 7.8 boundary).
//
// `proxyToBackend` returns 502 unless the backend response is
// application/json, so the fetch mock always sets that content-type.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as historyGet } from '../app/api/interactions/history/route';
import { GET as playlistsGet, POST as playlistsPost } from '../app/api/playlists/route';
import { GET as playlistDetailGet } from '../app/api/playlists/[id]/route';
import {
  GET as watchLaterGet,
  POST as watchLaterPost,
} from '../app/api/playlists/watch-later/route';
import { DELETE as watchLaterDelete } from '../app/api/playlists/watch-later/[entryId]/route';

const BACKEND = 'http://localhost:3006';

function makeFetchMock(status: number, rawBody: string) {
  return vi.fn(
    async (..._args: unknown[]) =>
      new Response(rawBody, {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function lastFetchCall(fetchMock: ReturnType<typeof makeFetchMock>) {
  const call = fetchMock.mock.calls[0];
  const url = call[0] as string;
  const init = call[1] as RequestInit & { headers: Record<string, string> };
  return { url, init, headers: init.headers as Record<string, string> };
}

let fetchMock: ReturnType<typeof makeFetchMock>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Each entry drives one in-scope proxy handler with a deterministic backend
// path so we can assert the proxy never rewrites the path, status, or body.
const cases = [
  {
    name: 'GET /api/interactions/history → /history',
    backendPath: '/history',
    invoke: () =>
      historyGet(
        new NextRequest('http://localhost:3000/api/interactions/history?page=2&pageSize=5', {
          method: 'GET',
          headers: { authorization: 'Bearer tok-hist', 'x-request-id': 'req-hist-1' },
        }),
      ),
    expectedUrl: `${BACKEND}/history?page=2&pageSize=5`,
    method: 'GET',
    token: 'Bearer tok-hist',
    reqId: 'req-hist-1',
  },
  {
    name: 'GET /api/playlists → /playlists',
    backendPath: '/playlists',
    invoke: () =>
      playlistsGet(
        new NextRequest('http://localhost:3000/api/playlists', {
          method: 'GET',
          headers: { authorization: 'Bearer tok-pl', 'x-request-id': 'req-pl-1' },
        }),
      ),
    expectedUrl: `${BACKEND}/playlists`,
    method: 'GET',
    token: 'Bearer tok-pl',
    reqId: 'req-pl-1',
  },
  {
    name: 'GET /api/playlists/[id] → /playlists/:id',
    backendPath: '/playlists/pl-42',
    invoke: () =>
      playlistDetailGet(
        new NextRequest('http://localhost:3000/api/playlists/pl-42', {
          method: 'GET',
          headers: { authorization: 'Bearer tok-det', 'x-request-id': 'req-det-1' },
        }),
        { params: Promise.resolve({ id: 'pl-42' }) },
      ),
    expectedUrl: `${BACKEND}/playlists/pl-42`,
    method: 'GET',
    token: 'Bearer tok-det',
    reqId: 'req-det-1',
  },
  {
    name: 'GET /api/playlists/watch-later → /playlists/watch-later',
    backendPath: '/playlists/watch-later',
    invoke: () =>
      watchLaterGet(
        new NextRequest('http://localhost:3000/api/playlists/watch-later', {
          method: 'GET',
          headers: { authorization: 'Bearer tok-wl', 'x-request-id': 'req-wl-1' },
        }),
      ),
    expectedUrl: `${BACKEND}/playlists/watch-later`,
    method: 'GET',
    token: 'Bearer tok-wl',
    reqId: 'req-wl-1',
  },
  {
    name: 'DELETE /api/playlists/watch-later/[entryId] → /playlists/watch-later/:entryId',
    backendPath: '/playlists/watch-later/e-9',
    invoke: () =>
      watchLaterDelete(
        new NextRequest('http://localhost:3000/api/playlists/watch-later/e-9', {
          method: 'DELETE',
          headers: { authorization: 'Bearer tok-del', 'x-request-id': 'req-del-1' },
        }),
        { params: Promise.resolve({ entryId: 'e-9' }) },
      ),
    expectedUrl: `${BACKEND}/playlists/watch-later/e-9`,
    method: 'DELETE',
    token: 'Bearer tok-del',
    reqId: 'req-del-1',
  },
];

describe('Property 11 — proxy passthrough: status + bearer + x-request-id forwarding', () => {
  // A representative spread of 2xx and 4xx/5xx statuses with distinct envelopes.
  const statusBodies: Array<{ status: number; body: unknown }> = [
    { status: 200, body: { success: true, data: { items: [{ id: 'a' }], total: 1 } } },
    { status: 201, body: { success: true, data: { id: 'created-1' } } },
    { status: 400, body: { success: false, error: { code: 'VALIDATION', message: 'bad' } } },
    { status: 403, body: { success: false, error: { code: 'FORBIDDEN' } } },
    { status: 404, body: { success: false, error: { code: 'NOT_FOUND' } } },
    { status: 500, body: { success: false, error: { code: 'INTERNAL' } } },
  ];

  for (const c of cases) {
    for (const { status, body } of statusBodies) {
      it(`${c.name} relays status ${status} + body verbatim and forwards bearer + x-request-id`, async () => {
        const raw = JSON.stringify(body);
        fetchMock = makeFetchMock(status, raw);
        vi.stubGlobal('fetch', fetchMock);

        const res = await c.invoke();

        // Forwarded to the exact backend path with the inbound verb (no rewrite).
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const { url, init, headers } = lastFetchCall(fetchMock);
        expect(url).toBe(c.expectedUrl);
        expect(init.method).toBe(c.method);

        // Req 7.2 / 7.3 — bearer + x-request-id forwarded to the backend.
        expect(headers['Authorization']).toBe(c.token);
        expect(headers['x-request-id']).toBe(c.reqId);

        // Req 7.4 — status relayed unchanged (no rewriting, incl. 4xx/5xx).
        expect(res.status).toBe(status);

        // Req 7.5 / 7.6 — body relayed byte-for-byte unchanged.
        const relayed = await res.text();
        expect(JSON.parse(relayed)).toEqual(body);
      });
    }
  }
});

describe('Property 11 — proxy makes no auth/authz decision (Req 7.8 boundary)', () => {
  it('forwards a request with NO Authorization header (does not self-issue 401)', async () => {
    fetchMock = makeFetchMock(200, JSON.stringify({ success: true, data: { items: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await playlistsGet(
      new NextRequest('http://localhost:3000/api/playlists', {
        method: 'GET',
        headers: { 'x-request-id': 'req-noauth' },
      }),
    );

    // The proxy still hits the backend (it does not short-circuit on a missing
    // token) and relays whatever the backend decided.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { headers } = lastFetchCall(fetchMock);
    expect(headers['Authorization']).toBeUndefined();
    expect(res.status).toBe(200);
  });

  it('forwards an arbitrary/opaque bearer unchanged (no token transform/validation)', async () => {
    fetchMock = makeFetchMock(
      401,
      JSON.stringify({ success: false, error: { code: 'UNAUTHENTICATED' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await watchLaterPost(
      new NextRequest('http://localhost:3000/api/playlists/watch-later', {
        method: 'POST',
        headers: {
          authorization: 'Bearer not-a-real-token',
          'x-request-id': 'req-opaque',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ videoId: 'v-1' }),
      }),
    );

    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/playlists/watch-later`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer not-a-real-token');
    expect(JSON.parse(init.body as string)).toEqual({ videoId: 'v-1' });
    // Proxy relays the backend's 401 verbatim — it did not make the decision.
    expect(res.status).toBe(401);
  });

  it('POST /api/playlists forwards the parsed body verbatim', async () => {
    fetchMock = makeFetchMock(201, JSON.stringify({ success: true, data: { id: 'pl-new' } }));
    vi.stubGlobal('fetch', fetchMock);

    const body = { title: 'My Playlist', visibility: 'public', isSystem: true };
    const res = await playlistsPost(
      new NextRequest('http://localhost:3000/api/playlists', {
        method: 'POST',
        headers: {
          authorization: 'Bearer tok-create',
          'x-request-id': 'req-create',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/playlists`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer tok-create');
    expect(headers['x-request-id']).toBe('req-create');
    // Body relayed verbatim — the proxy does not strip client-supplied fields
    // (e.g. isSystem); the backend is authoritative for that.
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });
});
