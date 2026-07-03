// @vitest-environment node
// ============================================================================
// quantchat — userinfo proxy forward tests (PR-A: OTP sign-in identity)
// ============================================================================
//
// Verifies the Next App Router `GET /api/auth/userinfo` handler forwards the
// caller's `Authorization` bearer to the backend `GET /auth/me` (the OIDC-style
// userinfo route), relays the backend status, and fails closed (502) when the
// backend is unreachable. Global `fetch` is mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as userinfoGet } from '../app/api/auth/userinfo/route';

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

describe('userinfo proxy: GET /api/auth/userinfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards the bearer to backend /auth/me and relays the verified user', async () => {
    const user = { id: 'u_123', email: 'a@b.co', username: 'qc_x', displayName: 'Q', role: 'user' };
    const fetchMock = jsonFetch(200, { success: true, data: user });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: { authorization: 'Bearer real.jwt.token' },
    });
    const res = await userinfoGet(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(`${BACKEND}/auth/me`);
    const init = (call[1] ?? {}) as RequestInit & { headers: Record<string, string> };
    expect(init.headers['Authorization']).toBe('Bearer real.jwt.token');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { id: string } };
    expect(body.data.id).toBe('u_123');
  });

  it('relays a 401 from the backend (fail closed on missing/invalid token)', async () => {
    const fetchMock = jsonFetch(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/auth/userinfo', { method: 'GET' });
    const res = await userinfoGet(req);
    expect(res.status).toBe(401);
  });

  it('returns 502 when the backend is unreachable (no fabricated user)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const req = new NextRequest('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: { authorization: 'Bearer x' },
    });
    const res = await userinfoGet(req);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });
});
