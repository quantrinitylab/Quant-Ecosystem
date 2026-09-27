import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { POST as requestPOST } from '../request/route';
import { POST as verifyPOST } from '../verify/route';
import { clearOtpForTesting, activeOtpCodes } from '../store';

// Mock fetch to simulate offline backend
const originalFetch = global.fetch;

describe('OTP Fallback Authentication', () => {
  beforeEach(() => {
    clearOtpForTesting();
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('request OTP returns success and demoCode 123456 when upstream is offline', async () => {
    const req = new Request('http://localhost/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210' }),
    });

    const res = await requestPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.demoCode).toBe('123456');
    expect(json.data.isFallback).toBe(true);

    const stored = activeOtpCodes.get('+919876543210');
    expect(stored).toBeDefined();
    expect(stored?.code).toBe('123456');
  });

  it('verify OTP with code 123456 returns success, accessToken, and user', async () => {
    const req = new Request('http://localhost/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919876543210', otp: '123456' }),
    });

    const res = await verifyPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeDefined();
    expect(json.data.user.phoneNumber).toBe('+919876543210');
    expect(json.data.isFallback).toBe(true);
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
});
