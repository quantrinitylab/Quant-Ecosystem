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

describe('OTP request proxy passes deliberate backend answers through verbatim (QC-F-442)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function otpRequest() {
    return new Request('http://localhost/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210' }),
    });
  }

  function upstreamJson(status: number, body: unknown) {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response,
    );
  }

  it('request OTP passes a backend 400 BAD_REQUEST through verbatim — not a fake 503', async () => {
    upstreamJson(400, {
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid request', statusCode: 400 },
    });

    const res = await requestPOST(otpRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toBe('Invalid request');
    expect(json.error.statusCode).toBe(400);
  });

  it('request OTP passes a backend 429 with metadata.retryAfter through verbatim', async () => {
    upstreamJson(429, {
      success: false,
      error: {
        code: 'OTP_REQUEST_FAILED',
        message: 'Too many code requests. Try again later.',
        statusCode: 429,
      },
      metadata: { retryAfter: 3600 },
    });

    const res = await requestPOST(otpRequest());
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_REQUEST_FAILED');
    expect(json.error.message).toBe('Too many code requests. Try again later.');
    // The cooldown the client needs for an honest retry UI must survive.
    expect(json.metadata).toEqual({ retryAfter: 3600 });
  });

  it('request OTP passes a backend 429 without metadata through without fabricating retryAfter', async () => {
    upstreamJson(429, {
      success: false,
      error: {
        code: 'OTP_REQUEST_FAILED',
        message: 'Invalid phone number format',
        statusCode: 429,
      },
    });

    const res = await requestPOST(otpRequest());
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe('OTP_REQUEST_FAILED');
    expect(json.error.message).toBe('Invalid phone number format');
    expect(json.metadata).toBeUndefined();
  });

  it('request OTP passes any other deliberate 4xx through verbatim (general rule, not just 400/429)', async () => {
    upstreamJson(403, {
      success: false,
      error: { code: 'OTP_COUNTRY_NOT_ALLOWED', message: 'Country not allowed', statusCode: 403 },
    });

    const res = await requestPOST(otpRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('OTP_COUNTRY_NOT_ALLOWED');
    expect(json.error.message).toBe('Country not allowed');
  });

  it('request OTP still strips demoCode from a forwarded error body (QC-F-062 strip applies to every passthrough)', async () => {
    upstreamJson(429, {
      success: false,
      demoCode: '654321',
      error: {
        code: 'OTP_REQUEST_FAILED',
        message: 'Please wait before requesting another code',
        statusCode: 429,
      },
      metadata: { retryAfter: 42 },
      data: { demoCode: '654321' },
    });

    const res = await requestPOST(otpRequest());
    expect(res.status).toBe(429);
    const text = await res.text();
    expect(text).not.toContain('demoCode');
    expect(text).not.toContain('654321');
    const json = JSON.parse(text);
    expect(json.error.code).toBe('OTP_REQUEST_FAILED');
    expect(json.metadata).toEqual({ retryAfter: 42 });
  });

  it('request OTP still fails closed with 503 when the backend answers 500 — even with a JSON error body', async () => {
    upstreamJson(500, {
      success: false,
      error: { code: 'INTERNAL', message: 'database exploded', statusCode: 500 },
    });

    const res = await requestPOST(otpRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_UPSTREAM_UNAVAILABLE');
  });

  it('request OTP fails closed with 503 when a deliberate-status body is not JSON (unparseable = upstream failure)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('error', { status: 400 }) as unknown as Response);

    const res = await requestPOST(otpRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OTP_UPSTREAM_UNAVAILABLE');
  });
});
