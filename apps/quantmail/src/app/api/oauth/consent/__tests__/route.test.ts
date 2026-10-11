// ============================================================================
// Tests for the Next.js POST /api/oauth/consent proxy
// (src/app/api/oauth/consent/route.ts).
// ============================================================================
//
// The backend consent screen is a plain HTML form, so it posts
// `application/x-www-form-urlencoded`. The proxy must parse that into the
// JSON the backend expects (the old `await request.json()`-only code turned
// every form submit into a 400). JSON callers keep working unchanged, and
// the backend's 302 (Location: <redirect_uri>?code=...) still passes through
// to the browser verbatim.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '../route';

const BACKEND = 'http://backend.test:3010';

describe('POST /api/oauth/consent', () => {
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

  it('parses a urlencoded form body and forwards it as JSON to the backend', async () => {
    fetchMock.mockResolvedValue(okJson({ ok: true }));
    const form = new URLSearchParams({
      action: 'approve',
      consent_token: 'tok.abc.def',
      client_id: 'client-1',
      redirect_uri: 'https://app.test.com/callback',
      scope: 'openid profile email',
      state: 'xyz',
    });
    const req = new NextRequest('http://localhost:3000/api/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/oauth/consent`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      action: 'approve',
      consent_token: 'tok.abc.def',
      client_id: 'client-1',
      redirect_uri: 'https://app.test.com/callback',
      scope: 'openid profile email',
      state: 'xyz',
    });
  });

  it('still forwards JSON bodies unchanged (programmatic callers)', async () => {
    fetchMock.mockResolvedValue(okJson({ ok: true }));
    const payload = {
      action: 'deny',
      client_id: 'client-1',
      redirect_uri: 'https://app.test.com/callback',
      user_id: 'user-1',
    };
    const req = new NextRequest('http://localhost:3000/api/oauth/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer header-token',
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(payload);
    // The Authorization header still reaches the backend
    expect(init.headers['Authorization']).toBe('Bearer header-token');
  });

  it('passes the backend 302 (approve -> ?code=...) through to the browser', async () => {
    const location = 'https://app.test.com/callback?code=ac_123&state=xyz';
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { location } }),
    );
    const req = new NextRequest('http://localhost:3000/api/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve&consent_token=t',
    });

    const res = await POST(req);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(location);
  });

  it('passes backend JSON errors through with their status', async () => {
    fetchMock.mockResolvedValue(
      okJson({ error: 'invalid_token', error_description: 'Consent session expired' }, 401),
    );
    const req = new NextRequest('http://localhost:3000/api/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve&consent_token=stale',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('invalid_token');
  });

  it('returns 502 BACKEND_UNAVAILABLE when the backend is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('connect refused'));
    const req = new NextRequest('http://localhost:3000/api/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe('BACKEND_UNAVAILABLE');
  });
});
