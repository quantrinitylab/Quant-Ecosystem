// @vitest-environment node
// ============================================================================
// quantmail — Stage-6 engine proxy forward tests (Task 14.5 / DoD-3, Req 8.5)
// ============================================================================
//
// Verifies the Next App Router proxy handlers (Layer 4 of the integration seam)
// for one encryption surface and one federation surface forward method + body
// to the quantmail backend URL and propagate the `Authorization` bearer + an
// `x-request-id` (minting one when absent), relaying the backend status. Global
// `fetch` is mocked; we assert on the URL/headers/body the shared
// `@quant/api-client` `proxyToBackend` utility passes to the backend.
//
// NOTE: these Next proxy route modules import ONLY the `_lib/*-proxy.ts` helpers
// (which import `@quant/api-client`) — NOT the broken `backend/routes/oauth.ts`
// — so they load cleanly despite the buildApp() breakage documented in the
// backend seam test. DoD-3 (proxy forward) is therefore fully exercisable.
//
// quantmail proxy helpers default the backend origin to http://localhost:3010
// (the quantmail backend PORT — Requirement 1.6) when NEXT_PUBLIC_QUANTMAIL_BACKEND_URL
// is unset. `proxyToBackend` returns 502 unless the backend response is
// application/json, so the fetch mock sets that content-type.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as e2eeMessagesPost } from '../app/api/e2ee/messages/route';
import { POST as federationBlockPost } from '../app/api/federation/instances/block/route';

const BACKEND = 'http://localhost:3010';

function makeFetchMock(status = 200, payload: unknown = { success: true, data: {} }) {
  return vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function lastFetchCall(fetchMock: ReturnType<typeof makeFetchMock>) {
  const call = fetchMock.mock.calls[0];
  if (!call) {
    throw new Error('expected fetch to have been called at least once');
  }
  const url = call[0] as string;
  const init = (call[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url, init, headers: init.headers as Record<string, string> };
}

describe('encryption proxy forward: POST /api/e2ee/messages', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;

  beforeEach(() => {
    fetchMock = makeFetchMock(202, { success: true, data: { envelope: { id: 'env-1' } } });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards method + body and propagates bearer + provided x-request-id', async () => {
    const body = { recipientId: 'peer-456', payload: { ciphertext: 'AAAA' } };
    const req = new NextRequest('http://localhost:3000/api/e2ee/messages', {
      method: 'POST',
      headers: {
        authorization: 'Bearer e2ee-token-abc',
        'x-request-id': 'req-e2ee-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await e2eeMessagesPost(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/e2ee/messages`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer e2ee-token-abc');
    expect(headers['x-request-id']).toBe('req-e2ee-123');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(202);
  });

  it('mints an x-request-id when the inbound request has none', async () => {
    const req = new NextRequest('http://localhost:3000/api/e2ee/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer e2ee-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ recipientId: 'peer-456', payload: {} }),
    });
    await e2eeMessagesPost(req);
    const { headers } = lastFetchCall(fetchMock);
    expect(headers['x-request-id']).toBeDefined();
    expect(headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('relays a non-2xx backend status to the caller', async () => {
    fetchMock = makeFetchMock(403, { success: false, error: { code: 'FORBIDDEN' } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/e2ee/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer e2ee-token-abc', 'content-type': 'application/json' },
      body: JSON.stringify({ recipientId: 'peer-456', payload: {} }),
    });
    const res = await e2eeMessagesPost(req);
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

  it('forwards method + body and propagates bearer + provided x-request-id', async () => {
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
});
