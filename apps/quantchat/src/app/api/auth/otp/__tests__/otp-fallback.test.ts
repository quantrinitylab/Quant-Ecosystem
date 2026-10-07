import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { POST as requestPOST } from '../request/route';
import { POST as verifyPOST } from '../verify/route';
import { clearOtpForTesting, activeOtpCodes } from '../store';

// Mock fetch to simulate offline backend
const originalFetch = global.fetch;

describe('OTP Fail-Closed Authentication (no demo bypass)', () => {
  beforeEach(() => {
    clearOtpForTesting();
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

    // SECURITY: no working code may be stored locally either
    expect(activeOtpCodes.get('+919876543210')).toBeUndefined();
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
    expect(activeOtpCodes.get('+919876543210')).toBeUndefined();
  });

  it('verify OTP with 123456 is rejected when upstream is offline (no universal code)', async () => {
    const req = new Request('http://localhost/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210', otp: '123456' }),
    });

    const res = await verifyPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(json.error.message).toBe('Invalid or expired verification code');
  });

  it('verify OTP accepts a locally-issued (real-SMS) code once, then it is spent', async () => {
    // Codes can only enter the store through a real upstream issuance;
    // here the test seeds one directly to verify the store path.
    activeOtpCodes.set('+919876543210', {
      code: '731946',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const req = new Request('http://localhost/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210', otp: '731946' }),
    });

    const res = await verifyPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeDefined();
    expect(json.data.user.phoneNumber).toBe('+919876543210');
    expect(json.data.isFallback).toBe(true);

    // one-time use: the same code must not verify again
    const req2 = new Request('http://localhost/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210', otp: '731946' }),
    });
    const res2 = await verifyPOST(req2);
    expect(res2.status).toBe(400);
  });

  it('verify OTP rejects an expired locally-issued code', async () => {
    activeOtpCodes.set('+919876543210', {
      code: '731946',
      expiresAt: Date.now() - 1000,
    });

    const req = new Request('http://localhost/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210', otp: '731946' }),
    });

    const res = await verifyPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('verify OTP with invalid code returns 400', async () => {
    const req = new Request('http://localhost/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210', otp: '000000' }),
    });

    const res = await verifyPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(json.error.message).toBe('Invalid or expired verification code');
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
