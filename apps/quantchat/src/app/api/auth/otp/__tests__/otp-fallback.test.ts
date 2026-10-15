import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { POST as requestPOST } from '../request/route';
import { POST as verifyPOST } from '../verify/route';

// Mock fetch to simulate offline backend
const originalFetch = global.fetch;

function verifyRequest(otp: string) {
  return new Request('http://localhost/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: '+919876543210', otp }),
  });
}

describe('OTP Fail-Closed Authentication (no demo bypass, no local token mint)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('request OTP fails closed with 503 when upstream is offline', async () => {
    const req = new Request('http://localhost/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210' }),
    });

    const res = await requestPOST(req);
    expect(res.status).toBe(503);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_UPSTREAM_UNAVAILABLE');
    // SECURITY: no code (demo or otherwise) may leak to the client
    expect(json.data?.demoCode).toBeUndefined();
  });

  it('request OTP strips demoCode from a successful upstream passthrough (QC-F-062 defense-in-depth)', async () => {
    // Simulates a stale backend that still returns the code in its response:
    // the proxy must not forward it to the browser.
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { message: 'Verification code sent', expiresIn: 300, demoCode: '654321' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ) as unknown as Response,
    );

    const req = new Request('http://localhost/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210' }),
    });

    const res = await requestPOST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('demoCode');
    expect(text).not.toContain('654321');
    const json = JSON.parse(text);
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Verification code sent');
    expect(json.data.expiresIn).toBe(300);
    expect(json.data.demoCode).toBeUndefined();
  });

  it('request OTP fails closed when upstream responds with an error status', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('error', { status: 500 }) as unknown as Response);

    const req = new Request('http://localhost/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210' }),
    });

    const res = await requestPOST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_UPSTREAM_UNAVAILABLE');
  });

  it('verify OTP fails closed with 503 when upstream is offline (QC-F-091 — no local fallback, no minted token)', async () => {
    const res = await verifyPOST(verifyRequest('123456'));
    expect(res.status).toBe(503);
    const text = await res.text();
    // SECURITY: the proxy must never mint a session token or fabricate a user
    expect(text).not.toContain('qchat_sess_');
    expect(text).not.toContain('accessToken');
    const json = JSON.parse(text);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_UPSTREAM_UNAVAILABLE');
  });

  it('verify OTP rejects EVERY code when upstream is offline — there is no locally-issued code path anymore (QC-F-091)', async () => {
    // Before the fix, a code seeded into the proxy's local store was
    // accepted while the backend was down and exchanged for a self-minted
    // `qchat_sess_...` token + fabricated user. That store is deleted:
    // any code at all must now fail closed.
    const res = await verifyPOST(verifyRequest('731946'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_UPSTREAM_UNAVAILABLE');
    expect(json.data).toBeUndefined();
  });

  it('verify OTP passes an upstream error status through verbatim instead of falling back (QC-F-091)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { message: 'Too many attempts', code: 'OTP_RATE_LIMITED' },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ) as unknown as Response,
    );

    const res = await verifyPOST(verifyRequest('731946'));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_RATE_LIMITED');
    expect(json.error.message).toBe('Too many attempts');
  });

  it('verify OTP passes an upstream invalid-code rejection through verbatim (backend is the only authority)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { message: 'Invalid verification code', code: 'OTP_INVALID' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ) as unknown as Response,
    );

    const res = await verifyPOST(verifyRequest('000000'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_INVALID');
    expect(json.error.message).toBe('Invalid verification code');
  });

  it('verify OTP passes an upstream success through verbatim — tokens come only from the backend', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            accessToken: 'backend-issued-access-token',
            refreshToken: 'backend-issued-refresh-token',
            user: { id: 'backend-user-id', phoneNumber: '+919876543210', role: 'USER' },
            isNewUser: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ) as unknown as Response,
    );

    const res = await verifyPOST(verifyRequest('731946'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBe('backend-issued-access-token');
    expect(json.data.refreshToken).toBe('backend-issued-refresh-token');
    expect(json.data.user.id).toBe('backend-user-id');
    expect(json.data.isFallback).toBeUndefined();
  });

  it('verify OTP still requires phoneNumber and otp', async () => {
    const req = new Request('http://localhost/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210' }),
    });

    const res = await verifyPOST(req);
    expect(res.status).toBe(400);
  });
});
