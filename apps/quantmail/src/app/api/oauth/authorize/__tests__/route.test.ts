// ============================================================================
// Tests for the Next.js GET /api/oauth/authorize proxy route
// (src/app/api/oauth/authorize/route.ts).
//
// Covers the fix/qm-oauth-authorize-302 addition: a browser fetch cannot read
// a redirect's Location (opaqueredirect) and must not follow the authorize
// 302 in the background, so callers that opt in with the X-Quant-OIDC-Browser
// header get the backend's 302 target as 200 JSON { redirect }. Callers that
// do not send the header keep the exact 302-passthrough behavior.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { OIDC_BROWSER_HEADER } from '../../../../sso/oidc-handoff';
import { GET } from '../route';

const BACKEND_BASE = 'http://localhost:3010';

function get(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { headers });
}

function backend302(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location },
  });
}

describe('GET /api/oauth/authorize', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.QUANTMAIL_BACKEND_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = realFetch;
  });

  function mockFetch(res: Response) {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(res);
    return global.fetch as unknown as ReturnType<typeof vi.fn>;
  }

  it('forwards query params to the backend /oauth/authorize', async () => {
    const fetchMock = mockFetch(backend302('https://rp.test/cb?code=ac_1'));
    const res = await GET(
      get(
        'http://localhost:3000/api/oauth/authorize?response_type=code&client_id=c1&redirect_uri=https%3A%2F%2Frp.test%2Fcb&state=s1',
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${BACKEND_BASE}/oauth/authorize?response_type=code&client_id=c1&redirect_uri=https%3A%2F%2Frp.test%2Fcb&state=s1`,
    );
    expect(res.status).toBe(302);
  });

  it('passes the backend 302 through verbatim by default (no opt-in header)', async () => {
    mockFetch(backend302('https://rp.test/cb?code=ac_1&state=s1'));
    const res = await GET(get('http://localhost:3000/api/oauth/authorize?client_id=c1'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://rp.test/cb?code=ac_1&state=s1');
    const body = await res.text();
    expect(body).toBe('');
  });

  it('answers 200 JSON { redirect } when the OIDC browser header opts in', async () => {
    mockFetch(backend302('https://rp.test/cb?code=ac_1&state=s1'));
    const res = await GET(
      get('http://localhost:3000/api/oauth/authorize?client_id=c1', {
        [OIDC_BROWSER_HEADER]: '1',
        Authorization: 'Bearer tok-123',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = await res.json();
    expect(data).toEqual({ redirect: 'https://rp.test/cb?code=ac_1&state=s1' });
    // The access token still reaches the backend in the Authorization header
    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('keeps the verbatim 302 when the opt-in header is absent even with a bearer token', async () => {
    mockFetch(backend302('https://rp.test/cb?code=ac_1'));
    const res = await GET(
      get('http://localhost:3000/api/oauth/authorize?client_id=c1', {
        Authorization: 'Bearer tok-123',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://rp.test/cb?code=ac_1');
  });

  it('passes the 200 HTML consent screen through verbatim', async () => {
    const html = '<html><body><form action="/api/oauth/consent">x</form></body></html>';
    mockFetch(
      new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const res = await GET(
      get('http://localhost:3000/api/oauth/authorize?client_id=c1', {
        [OIDC_BROWSER_HEADER]: '1',
        Authorization: 'Bearer tok-123',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toBe(html);
  });

  it('passes JSON errors (401) through with their status', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await GET(
      get('http://localhost:3000/api/oauth/authorize?client_id=c1', {
        [OIDC_BROWSER_HEADER]: '1',
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns 502 BACKEND_UNAVAILABLE when the backend is unreachable', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('connect ECONNREFUSED'),
    );
    const res = await GET(get('http://localhost:3000/api/oauth/authorize?client_id=c1'));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe('BACKEND_UNAVAILABLE');
  });
});
