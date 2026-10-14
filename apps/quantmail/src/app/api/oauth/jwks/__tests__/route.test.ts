// ============================================================================
// Tests for the Next.js GET /api/oauth/jwks proxy
// (src/app/api/oauth/jwks/route.ts).
// ============================================================================
//
// The public discovery document advertises jwks_uri as
// `${issuer}/api/oauth/jwks` (fix/qm-jwks-uri-live): this route must proxy to
// the backend's GET /.well-known/jwks.json and hand the JWKS back verbatim.
// A 200 JWKS response is cacheable (`public, max-age=3600`, like the
// discovery document itself); honest backend errors pass through untouched.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from '../route';

const BACKEND = 'http://backend.test:3010';

const JWKS = {
  keys: [
    {
      kty: 'RSA',
      kid: 'test-kid-1',
      use: 'sig',
      alg: 'RS256',
      n: 'test-modulus',
      e: 'AQAB',
    },
  ],
};

describe('GET /api/oauth/jwks', () => {
  const originalEnv = process.env.QUANTMAIL_BACKEND_URL;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.QUANTMAIL_BACKEND_URL = BACKEND;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnv === undefined) delete process.env.QUANTMAIL_BACKEND_URL;
    else process.env.QUANTMAIL_BACKEND_URL = originalEnv;
  });

  const okJson = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const get = () =>
    new NextRequest('http://localhost:3000/api/oauth/jwks', { method: 'GET' });

  it('proxies to the backend JWKS document and returns it verbatim', async () => {
    fetchMock.mockResolvedValue(okJson(JWKS));

    const res = await GET(get());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/.well-known/jwks.json`);
    expect(init.method).toBe('GET');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(JWKS);
  });

  it('marks a 200 JWKS response public-cacheable like the discovery document', async () => {
    fetchMock.mockResolvedValue(okJson(JWKS));

    const res = await GET(get());

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('passes an honest backend 404 through without a public cache header', async () => {
    fetchMock.mockResolvedValue(okJson({ error: 'not_found' }, 404));

    const res = await GET(get());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns an honest 502 when the backend is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await GET(get());

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe('BACKEND_UNAVAILABLE');
  });
});
