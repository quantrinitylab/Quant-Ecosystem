// @vitest-environment node
// ============================================================================
// QuantAI — guest session minting tests (P0-2 fix, 2026-10-06)
//
// Guest chat was broken by construction: every guest message hit
// POST /api/sessions/{id}/messages/stream with no Authorization header and
// got 401 -> "Sorry, I encountered an error." forever.
//
// POST /api/guest/session now mints a short-lived, guest-scoped JWT signed
// with the same secret the backend auth gate verifies, so guests use the
// REAL inference path. These tests pin the minting contract:
//   1. the token verifies with the shared secret and carries the guest claims,
//   2. issuer/audience match what the backend's auth plugin accepts,
//   3. minting is per-IP rate limited (abuse bound),
//   4. without the shared secret the route fails HONESTLY (503) — it never
//      mints an unsigned token or falls back to a fabricated reply.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import {
  POST,
  GET,
  __resetGuestMintLog,
  GUEST_TTL_SECONDS,
  GUEST_MINTS_PER_WINDOW,
} from '../route';

const TEST_SECRET = 'test-guest-jwt-secret';
const OLD_ENV = { ...process.env };

function postRequest(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/guest/session', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  __resetGuestMintLog();
  process.env.JWT_SECRET = TEST_SECRET;
  delete process.env['jwt-secret'];
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  __resetGuestMintLog();
});

describe('POST /api/guest/session', () => {
  it('mints a verifiable guest JWT the backend auth gate will accept', async () => {
    const res = await POST(postRequest('10.0.0.1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { token: string; guestId: string; expiresIn: number };
    };
    expect(json.success).toBe(true);
    expect(json.data.expiresIn).toBe(GUEST_TTL_SECONDS);

    // Verifies with the shared secret, HS256, backend-accepted iss/aud.
    const { payload } = await jwtVerify(
      json.data.token,
      new TextEncoder().encode(TEST_SECRET),
      { issuer: 'quantai', audience: 'quant-ecosystem' },
    );
    expect(payload.sub).toMatch(/^guest:/);
    expect(payload.sub).toBe(json.data.guestId);
    expect(payload['guest']).toBe(true);
    expect(payload['scope']).toBe('guest:chat');
    expect(typeof payload.jti).toBe('string');

    // ~20 minute lifetime, not a day-long credential.
    const ttl = (payload.exp ?? 0) - (payload.iat ?? 0);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(GUEST_TTL_SECONDS);
  });

  it('fails honestly with 503 when the shared JWT secret is not configured', async () => {
    delete process.env.JWT_SECRET;
    const res = await POST(postRequest('10.0.0.2'));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { success: boolean; code: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('GUEST_UNAVAILABLE');
  });

  it('rate-limits minting per IP', async () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < GUEST_MINTS_PER_WINDOW; i++) {
      const res = await POST(postRequest(ip));
      expect(res.status).toBe(200);
    }
    const limited = await POST(postRequest(ip));
    expect(limited.status).toBe(429);
    const json = (await limited.json()) as { code: string };
    expect(json.code).toBe('GUEST_RATE_LIMITED');

    // A different IP is unaffected.
    const other = await POST(postRequest('10.0.0.4'));
    expect(other.status).toBe(200);
  });

  it('rejects GET with 405', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
