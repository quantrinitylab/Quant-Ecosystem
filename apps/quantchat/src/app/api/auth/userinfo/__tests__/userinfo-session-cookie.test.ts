import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const originalFetch = global.fetch;

function userinfoReq(init: { authHeader?: string; cookie?: string }) {
  return new NextRequest('http://localhost:3000/api/auth/userinfo', {
    headers: {
      ...(init.authHeader ? { authorization: init.authHeader } : {}),
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
  });
}

describe('QC-F-154 userinfo accepts the HttpOnly session cookie', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('serves the user from the cookie alone, re-attaching it as the backend Bearer header', async () => {
    let seenAuth: string | undefined;
    global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      seenAuth = (init.headers as Record<string, string>)['Authorization'];
      expect(String(url)).toContain('/auth/me');
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { user: { id: 'u9' } } }), {
          status: 200,
        }),
      );
    }) as unknown as typeof fetch;

    const res = await GET(userinfoReq({ cookie: 'quant_access_token=CK' }));
    expect(res.status).toBe(200);
    expect(seenAuth).toBe('Bearer CK');
    const json = await res.json();
    expect(json.data.user.id).toBe('u9');
  });

  it('fail-closes 401 when neither header nor cookie exists', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await GET(userinfoReq({}));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fail-closes 503 (no fabricated identity) when the backend is down — cookie path too', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      expect(String(url)).toContain('/auth/me');
      return Promise.resolve(new Response('{}', { status: 503 }));
    }) as unknown as typeof fetch;

    const res = await GET(userinfoReq({ cookie: 'quant_access_token=CK' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    // P0-A regression: never a fabricated user.
    expect(json.data?.user).toBeUndefined();
  });

  it('never offers a cookie-carried access token to /auth/sso/exchange as an ssoToken', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      calls.push(String(url));
      return Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 401 }));
    }) as unknown as typeof fetch;

    const res = await GET(userinfoReq({ cookie: 'quant_access_token=CK' }));
    expect(res.status).toBe(401);
    // Only the /auth/me attempt; no exchange of the session cookie.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/auth/me');
    expect(calls.some((u) => u.includes('/auth/sso/exchange'))).toBe(false);
  });
});
