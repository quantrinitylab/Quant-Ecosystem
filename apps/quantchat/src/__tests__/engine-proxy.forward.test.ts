// @vitest-environment node
// ============================================================================
// quantchat — Stage-6 engine proxy forward tests (Task 14.5 / DoD-3, Req 8.5)
// ============================================================================
//
// Verifies the Next App Router proxy handlers (Layer 4 of the integration seam)
// for one encryption surface, one federation surface and one ar-lenses surface
// forward method + body/query to the quantchat backend URL and propagate the
// `Authorization` bearer + an `x-request-id` (minting one when absent), relaying
// the backend status. Global `fetch` is mocked; we assert on the
// URL/headers/body the shared `@quant/api-client` `proxyToBackend` utility (used
// by every quantchat `_lib/*-proxy.ts` helper) passes to the backend.
//
// All quantchat proxy helpers default the backend origin to
// http://localhost:3002 (the quantchat backend PORT — Requirement 1.6) when
// NEXT_PUBLIC_QUANTCHAT_BACKEND_URL is unset. `proxyToBackend` returns 502
// unless the backend response is application/json, so the fetch mock sets that
// content-type.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as e2eeMessagesPost } from '../app/api/e2ee/messages/route';
import { POST as federationBlockPost } from '../app/api/federation/instances/block/route';
import { POST as arGeneratePost } from '../app/api/ar-lenses/lenses/generate/route';

const BACKEND = 'http://localhost:3002';

function makeFetchMock(status = 200, payload: unknown = { success: true, data: {} }) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
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

  it('forwards method + body and propagates bearer + provided x-request-id', async () => {
    const body = { prompt: 'sparkle mask', style: 'glam', intensity: 0.6 };
    const req = new NextRequest('http://localhost:3000/api/ar-lenses/lenses/generate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ar-token-abc',
        'x-request-id': 'req-ar-789',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await arGeneratePost(req);

    const { url, init, headers } = lastFetchCall(fetchMock);
    expect(url).toBe(`${BACKEND}/ar-lenses/lenses/generate`);
    expect(init.method).toBe('POST');
    expect(headers['Authorization']).toBe('Bearer ar-token-abc');
    expect(headers['x-request-id']).toBe('req-ar-789');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
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
