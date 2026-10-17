import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from '../route';
import { loginRateLimiter } from '../../../../../lib/rate-limit';

// F-213: the login proxy must rate-limit per client IP (credential-stuffing
// defense). The limiter sits BEFORE body validation and the upstream proxy,
// so even malformed attempts count — stuffing bots don't send valid bodies.

function loginRequest(ip: string): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({ email: 'user@quantmail.in', password: 'wrong' }),
  });
}

describe('POST /api/auth/login rate limiting (F-213)', () => {
  beforeEach(() => {
    loginRateLimiter.reset();
  });

  it('returns 429 with RATE_LIMITED + Retry-After after the burst is exhausted', async () => {
    const ip = '203.0.113.50';
    // Burst capacity is 10: first 10 pass the limiter (they then fail at the
    // unreachable upstream -> 502, which proves the limiter let them through).
    for (let i = 0; i < 10; i++) {
      const res = await POST(loginRequest(ip));
      expect(res.status).not.toBe(429);
    }
    const limited = await POST(loginRequest(ip));
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    const json = await limited.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMITED');
  });

  it('limits per IP: a different client is unaffected', async () => {
    const attacker = '198.51.100.77';
    for (let i = 0; i < 11; i++) {
      await POST(loginRequest(attacker));
    }
    const victimRes = await POST(loginRequest('192.0.2.99'));
    expect(victimRes.status).not.toBe(429);
  });

  it('counts attempts even when the request body is invalid', async () => {
    const ip = '203.0.113.51';
    const bad = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({}),
    });
    for (let i = 0; i < 10; i++) {
      await POST(bad.clone());
    }
    const limited = await POST(bad.clone());
    expect(limited.status).toBe(429);
  });

  it('still validates input normally when under the limit', async () => {
    const res = await POST(loginRequest('203.0.113.52'));
    // Upstream is unreachable in tests -> 502 proves the request flowed past
    // the limiter into the normal validation/proxy path.
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe('AUTH_SERVICE_UNAVAILABLE');
  });
});
