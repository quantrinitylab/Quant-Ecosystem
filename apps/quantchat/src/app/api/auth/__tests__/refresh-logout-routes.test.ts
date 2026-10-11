import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as refreshPOST } from '../refresh/route';
import { POST as logoutPOST } from '../logout/route';

const originalFetch = global.fetch;

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/refresh (Next proxy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects a missing refreshToken with 400 without calling the backend', async () => {
    global.fetch = vi.fn();
    const res = await refreshPOST(jsonRequest('http://localhost:3000/api/auth/refresh', {}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forwards a valid refresh and mirrors the rotated access token into HttpOnly cookies', async () => {
    const backendPayload = {
      success: true,
      data: {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
      },
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(backendPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await refreshPOST(
      jsonRequest('http://localhost:3000/api/auth/refresh', { refreshToken: 'old-refresh-token' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(backendPayload);

    const setCookies = res.headers.getSetCookie().join('\n');
    expect(setCookies).toContain('quant_access_token=new-access-token');
    expect(setCookies).toContain('token=new-access-token');
    expect(setCookies.toLowerCase()).toContain('httponly');
  });

  it('passes a backend 401 through honestly (no fabricated success, no cookies)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_REFRESH_TOKEN' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await refreshPOST(
      jsonRequest('http://localhost:3000/api/auth/refresh', { refreshToken: 'dead-refresh-token' }),
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(res.headers.getSetCookie().join('\n')).not.toContain('quant_access_token=');
  });

  it('fails closed with 502 when the auth backend is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await refreshPOST(
      jsonRequest('http://localhost:3000/api/auth/refresh', { refreshToken: 'some-refresh-token' }),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('POST /api/auth/logout (Next cookie expiry)', () => {
  it('expires ALL session cookies so a signed-out session cannot resurrect', async () => {
    const res = await logoutPOST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const setCookies = res.headers.getSetCookie();
    const joined = setCookies.join('\n');
    expect(joined).toContain('quant_access_token=');
    expect(joined).toContain('token=');
    // Also the refresh cookie PR #861's SSO callback/ticket routes set.
    expect(joined).toContain('quant_refresh_token=');
    // Expired: Max-Age=0 on every cookie.
    for (const cookie of setCookies) {
      expect(cookie).toContain('Max-Age=0');
      expect(cookie.toLowerCase()).toContain('httponly');
    }
  });
});
