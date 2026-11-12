import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const originalFetch = global.fetch;

function loginReq() {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.com', password: 'secret' }),
  });
}

describe('QC-F-154 login sets canonical session cookies', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sets HttpOnly access+refresh cookies (with real lifetimes) on successful login', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: 'ACC', refreshToken: 'REF', user: { id: 'u1' } },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const res = await POST(loginReq());
    expect(res.status).toBe(200);
    // Release-A compat: the old client still reads the body — it stays.
    const json = await res.json();
    expect(json.data.accessToken).toBe('ACC');

    const cookies = res.headers.getSetCookie();
    const access = cookies.find((c) => c.startsWith('quant_access_token=ACC'));
    expect(access).toBeDefined();
    expect(access).toContain('HttpOnly');
    expect(access).toContain('Path=/');
    expect(access).toContain('Max-Age=3600');

    const refresh = cookies.find((c) => c.startsWith('quant_refresh_token=REF'));
    expect(refresh).toBeDefined();
    expect(refresh).toContain('HttpOnly');
    // The refresh token NEVER rides data routes: path-scoped to /api/auth.
    expect(refresh).toContain('Path=/api/auth');
    expect(refresh).toContain('Max-Age=2592000');
  });

  it('does not set a refresh cookie when the backend issues none (no access-as-refresh)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { accessToken: 'ACC', user: { id: 'u1' } } }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    const res = await POST(loginReq());
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.startsWith('quant_refresh_token='))).toBe(false);
  });

  it('sets no cookies on a failed login', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { code: 'BAD_CREDENTIALS' } }), {
        status: 401,
      }),
    ) as unknown as typeof fetch;

    const res = await POST(loginReq());
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
