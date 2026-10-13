// @vitest-environment node
// ============================================================================
// quantchat — bitmoji proxy forward tests (QC-F-089)
// ============================================================================
// The /bitmoji page and apiClient called /api/bitmoji/* paths that did not
// exist at the Next layer at all. These tests verify the new App Router
// handlers forward method + Authorization + body to the real backend
// /bitmoji routes and relay the status verbatim.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as currentGet } from '../app/api/bitmoji/current/route';
import { GET as meGet } from '../app/api/bitmoji/me/route';
import { POST as savePost } from '../app/api/bitmoji/save/route';
import { POST as rootPost, PUT as rootPut } from '../app/api/bitmoji/route';

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

describe('bitmoji proxy (QC-F-089)', () => {
  it('GET /api/bitmoji/current forwards Bearer to backend /bitmoji/me', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { config: null, updatedAt: null } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/bitmoji/current', {
      method: 'GET',
      headers: { authorization: 'Bearer <redacted>' },
    });
    const res = await currentGet(req);
    expect(res.status).toBe(200);
    const { url, headers } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/bitmoji/me`);
    expect(headers['Authorization']).toBe('Bearer <redacted>');
  });

  it('GET /api/bitmoji/me forwards to backend /bitmoji/me', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { config: null, updatedAt: null } });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/bitmoji/me', { method: 'GET' });
    const res = await meGet(req);
    expect(res.status).toBe(200);
    expect(call(fetchMock).url).toBe(`${BACKEND}/bitmoji/me`);
  });

  it('POST /api/bitmoji/save forwards the {config} body to backend POST /bitmoji', async () => {
    const fetchMock = jsonFetch(201, { success: true, data: { config: {}, updatedAt: 'x' } });
    vi.stubGlobal('fetch', fetchMock);
    const config = { faceShape: 'oval', hairColor: '#FF4500' };
    const req = new NextRequest('http://localhost:3000/api/bitmoji/save', {
      method: 'POST',
      headers: { authorization: 'Bearer <redacted>', 'content-type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    const res = await savePost(req);
    expect(res.status).toBe(201);
    const { url, init } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/bitmoji`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ config });
  });

  it('POST and PUT /api/bitmoji forward to backend /bitmoji with their own verbs', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { config: {}, updatedAt: 'x' } });
    vi.stubGlobal('fetch', fetchMock);
    const postReq = new NextRequest('http://localhost:3000/api/bitmoji', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: {} }),
    });
    await rootPost(postReq);
    expect(call(fetchMock).init.method).toBe('POST');
    expect(call(fetchMock).url).toBe(`${BACKEND}/bitmoji`);

    const putReq = new NextRequest('http://localhost:3000/api/bitmoji', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: {} }),
    });
    await rootPut(putReq);
    const putCall = fetchMock.mock.calls[1]!;
    const putInit = (putCall[1] ?? {}) as RequestInit;
    expect(String(putCall[0])).toBe(`${BACKEND}/bitmoji`);
    expect(putInit.method).toBe('PUT');
  });

  it('relays a backend failure status verbatim instead of masking it', async () => {
    const fetchMock = jsonFetch(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/bitmoji/current', { method: 'GET' });
    const res = await currentGet(req);
    expect(res.status).toBe(401);
  });
});
