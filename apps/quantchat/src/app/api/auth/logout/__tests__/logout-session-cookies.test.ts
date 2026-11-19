import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const originalFetch = global.fetch;

function logoutReq(init: { origin?: string } = {}) {
  return new NextRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: {
      ...(init.origin ? { origin: init.origin } : {}),
    },
    body: JSON.stringify({}),
  });
}

describe('QC-F-154 logout expires every session cookie path-aligned', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Backend revocation is best-effort; logout must succeed regardless.
    global.fetch = vi.fn().mockRejectedValue(new Error('backend down')) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('expires access + legacy cookies and the refresh cookie on BOTH paths', async () => {
    const res = await POST(logoutReq());
    expect(res.status).toBe(200);

    const cookies = res.headers.getSetCookie();
    expect(cookies.every((c) => c.includes('Max-Age=0'))).toBe(true);

    const refreshExpired = cookies.filter((c) => c.startsWith('quant_refresh_token='));
    // QC-F-154 §3.1-6: the refresh cookie was SET on '/api/auth' — expiry must
    // match that path (plus the legacy '/' copy), or the browser keeps it and
    // the "signed-out" session silently resurrects.
    expect(refreshExpired.some((c) => c.includes('Path=/api/auth'))).toBe(true);
    expect(refreshExpired.some((c) => c.includes('Path=/;'))).toBe(true);

    expect(cookies.some((c) => c.startsWith('quant_access_token=;'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('token=;'))).toBe(true);
  });

  it('rejects cross-origin logout POSTs 403 (CSRF)', async () => {
    const res = await POST(logoutReq({ origin: 'https://evil.example.com' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('CSRF_BLOCKED');
  });
});
