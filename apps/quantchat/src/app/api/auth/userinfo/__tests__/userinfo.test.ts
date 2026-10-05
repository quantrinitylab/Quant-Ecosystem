import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../route';

const originalFetch = global.fetch;

describe('QuantChat Userinfo Route Resiliency', () => {
  beforeEach(() => {
    // Default: simulate offline backend (fetch fails)
    global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3002'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns 401 when authorization header is missing', async () => {
    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(json.error.message).toBe('No authorization header');
  });

  it('returns 401 when authorization header is empty or whitespace', async () => {
    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: 'Bearer   ',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 and decoded user identity for qchat_sess_<timestamp>_<phoneHex> token when backend is offline', async () => {
    const rawPhone = '+919876543210';
    const phoneHex = Buffer.from(rawPhone).toString('hex');
    const token = `qchat_sess_${Date.now()}_${phoneHex}`;

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.phoneNumber).toBe('+919876543210');
    expect(json.data.username).toBe('User 3210');
    expect(json.data.email).toBe('919876543210@quantchat.local');
    expect(json.data.role).toBe('USER');
    expect(json.data.isFallback).toBe(true);
    expect(json.data.id).toMatch(/^user_/);
  });

  it('returns 200 and decoded user identity for qchat_sess_<phoneHex> token when backend is offline', async () => {
    const rawPhone = '+14155552671';
    const phoneHex = Buffer.from(rawPhone).toString('hex');
    const token = `qchat_sess_${phoneHex}`;

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.phoneNumber).toBe('+14155552671');
    expect(json.data.username).toBe('User 2671');
    expect(json.data.role).toBe('USER');
    expect(json.data.isFallback).toBe(true);
  });

  it('returns 502 for non-qchat bearer token when backend is offline', async () => {
    const token = 'header.payload.signature_jwt_token';

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(json.error.message).toBe('Auth backend is unavailable');
    expect(json.error.statusCode).toBe(502);
  });

  it('handles upstream 502/503/504 status by falling back to resilient userinfo', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Bad Gateway' }),
    } as unknown as Response);

    const rawPhone = '+919876543210';
    const phoneHex = Buffer.from(rawPhone).toString('hex');
    const token = `qchat_sess_${Date.now()}_${phoneHex}`;

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.phoneNumber).toBe('+919876543210');
    expect(json.data.isFallback).toBe(true);
  });

  it('returns upstream 200 response when backend is healthy and returns user data', async () => {
    const upstreamUser = {
      id: 'usr_real_upstream_123',
      phoneNumber: '+919876543210',
      username: 'RealUpstreamUser',
      email: 'user@quantchat.in',
      role: 'USER',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: upstreamUser }),
    } as unknown as Response);

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid_upstream_jwt',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('usr_real_upstream_123');
    expect(json.data.username).toBe('RealUpstreamUser');
    expect(json.data.isFallback).toBeUndefined();
  });

  it('handles upstream 401 by attempting transparent SSO exchange and returning exchanged user with cookies', async () => {
    const ssoUser = {
      id: 'usr_sso_exchanged_456',
      email: 'pilot@quantmail.in',
      username: 'pilot',
      displayName: 'SSO Pilot',
      role: 'USER',
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/auth/me')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized JWT' }),
        } as unknown as Response;
      }
      if (urlStr.includes('/auth/sso/exchange')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              user: ssoUser,
              accessToken: 'qc_native_access_token_xyz',
              refreshToken: 'qc_native_refresh_token_xyz',
            },
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });

    global.fetch = fetchMock;

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: 'Bearer unexchanged_quantmail_jwt',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('usr_sso_exchanged_456');
    expect(json.data.email).toBe('pilot@quantmail.in');

    const cookies = res.cookies.getAll();
    expect(cookies.some((c) => c.name === 'quant_access_token' && c.value === 'qc_native_access_token_xyz')).toBe(true);
    expect(cookies.some((c) => c.name === 'token' && c.value === 'qc_native_access_token_xyz')).toBe(true);
  });

  it('handles upstream 401 with failing SSO exchange by falling back to decoded JWT identity', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/auth/me')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized JWT' }),
        } as unknown as Response;
      }
      if (urlStr.includes('/auth/sso/exchange')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ success: false, error: { message: 'Invalid ticket' } }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });

    global.fetch = fetchMock;

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'usr_quantmail_fallback',
        email: 'fallback@quantmail.in',
        name: 'Fallback User',
      }),
    ).toString('base64url');
    const rawJwt = `${header}.${payload}.mockSignature`;

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${rawJwt}`,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('usr_quantmail_fallback');
    expect(json.data.email).toBe('fallback@quantmail.in');
    expect(json.data.isFallback).toBe(true);
  });
});
