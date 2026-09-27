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

  it('returns 200 with fallback user object for non-qchat bearer token when backend is offline', async () => {
    const token = 'header.payload.signature_jwt_token';

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
    expect(json.data.id).toBe('user_fallback');
    expect(json.data.username).toBe('QuantChat User');
    expect(json.data.role).toBe('USER');
    expect(json.data.isFallback).toBe(true);
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
});
