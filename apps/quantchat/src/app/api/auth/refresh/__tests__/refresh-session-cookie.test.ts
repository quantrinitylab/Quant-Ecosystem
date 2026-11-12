import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const originalFetch = global.fetch;

function refreshReq(init: { cookie?: string; body?: unknown; origin?: string }) {
  return new NextRequest('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.origin ? { origin: init.origin } : {}),
    },
    body: JSON.stringify(init.body ?? {}),
  });
}

function okBackend() {
  return vi.fn().mockImplementation((_url: string, init: RequestInit) => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: 'NEW_ACC', refreshToken: 'NEW_REF', user: { id: 'u1' } },
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;
}

describe('QC-F-154 refresh reads the HttpOnly cookie first', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses the refresh cookie (not the body) and forwards the deviceId (QC-F-154 §2d-4)', async () => {
    const fetchMock = okBackend();
    global.fetch = fetchMock;
    let backendBody: Record<string, unknown> = {};

    const res = await POST(
      refreshReq({ cookie: 'quant_refresh_token=COOKIE_R', body: { deviceId: 'dev-1' } }),
    );
    expect(res.status).toBe(200);

    const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    backendBody = JSON.parse(calls[0][1].body as string) as Record<string, unknown>;
    expect(backendBody.refreshToken).toBe('COOKIE_R');
    expect(backendBody.deviceId).toBe('dev-1');

    // Both canonical cookies are re-set with real lifetimes.
    const cookies = res.headers.getSetCookie();
    const access = cookies.find((c) => c.startsWith('quant_access_token=NEW_ACC'));
    expect(access).toContain('Max-Age=3600');
    const refresh = cookies.find((c) => c.startsWith('quant_refresh_token=NEW_REF'));
    expect(refresh).toContain('Path=/api/auth');
    expect(refresh).toContain('Max-Age=2592000');
  });

  it('still accepts the legacy body field (old-client compat)', async () => {
    global.fetch = okBackend();
    const res = await POST(refreshReq({ body: { refreshToken: 'BODY_REFRESH' } }));
    expect(res.status).toBe(200);
    const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const backendBody = JSON.parse(calls[0][1].body as string) as Record<string, unknown>;
    expect(backendBody.refreshToken).toBe('BODY_REFRESH');
  });

  it('fails closed 400 when neither cookie nor body carries a credential', async () => {
    const fetchMock = okBackend();
    global.fetch = fetchMock;
    const res = await POST(refreshReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects cross-origin refresh POSTs 403 before touching the backend (CSRF)', async () => {
    const fetchMock = okBackend();
    global.fetch = fetchMock;
    const res = await POST(
      refreshReq({ cookie: 'quant_refresh_token=COOKIE_R', origin: 'https://evil.example.com' }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('CSRF_BLOCKED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
