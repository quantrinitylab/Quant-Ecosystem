import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// `middleware` reads OWNER_SECRET at call time, so each test sets/clears it
// explicitly rather than relying on ambient env.
const ORIGINAL_OWNER_SECRET = process.env.OWNER_SECRET;

afterEach(() => {
  if (ORIGINAL_OWNER_SECRET === undefined) {
    delete process.env.OWNER_SECRET;
  } else {
    process.env.OWNER_SECRET = ORIGINAL_OWNER_SECRET;
  }
});

function request(path: string, init?: { token?: string; cookie?: string }): NextRequest {
  const headers = new Headers();
  if (init?.token) headers.set('Authorization', `Bearer ${init.token}`);
  if (init?.cookie) headers.set('cookie', `owner_token=${init.cookie}`);
  return new NextRequest(new URL(`https://quanttrinity.quantrinity.in${path}`), { headers });
}

/** A middleware response that let the request through has no JSON error body. */
function isPassThrough(response: Response): boolean {
  return response.status === 200 && response.headers.has('x-middleware-next');
}

describe('quanttrinity owner API gate', () => {
  describe('/api/health stays public', () => {
    // Regression: this path used to be owner-gated, so the Kubernetes liveness
    // probe got 401, failed, and SIGTERMed the pod. Next.js exited gracefully
    // (code 0, reason "Completed"), so ~300 restarts over 18h produced no error
    // in the logs and the deployment simply reported 0/1 available.
    it('passes an unauthenticated probe through', () => {
      delete process.env.OWNER_SECRET;
      expect(isPassThrough(middleware(request('/api/health')))).toBe(true);
    });

    it('passes even when OWNER_SECRET is unset, which otherwise fails closed', () => {
      delete process.env.OWNER_SECRET;
      const gated = middleware(request('/api/overview', { token: 'anything' }));
      expect(gated.status).toBe(503);
      expect(isPassThrough(middleware(request('/api/health')))).toBe(true);
    });
  });

  describe('every other /api path stays gated', () => {
    it('rejects a request with no credential as 401', () => {
      process.env.OWNER_SECRET = 'correct-horse-battery-staple';
      expect(middleware(request('/api/overview')).status).toBe(401);
    });

    it('fails closed with 503 when OWNER_SECRET is not configured', () => {
      delete process.env.OWNER_SECRET;
      expect(middleware(request('/api/overview', { token: 'tok' })).status).toBe(503);
    });

    it('rejects a wrong secret as 403', () => {
      process.env.OWNER_SECRET = 'correct-horse-battery-staple';
      expect(middleware(request('/api/overview', { token: 'wrong' })).status).toBe(403);
    });

    it('rejects a JWT-shaped string that is not the secret', () => {
      process.env.OWNER_SECRET = 'correct-horse-battery-staple';
      expect(middleware(request('/api/overview', { token: 'eyJhbGciOiJIUzI1NiJ9.e30.x' })).status).toBe(403);
    });

    it('accepts the exact secret via Authorization header', () => {
      process.env.OWNER_SECRET = 'correct-horse-battery-staple';
      const res = middleware(request('/api/overview', { token: 'correct-horse-battery-staple' }));
      expect(isPassThrough(res)).toBe(true);
    });

    it('accepts the exact secret via owner_token cookie', () => {
      process.env.OWNER_SECRET = 'correct-horse-battery-staple';
      const res = middleware(request('/api/overview', { cookie: 'correct-horse-battery-staple' }));
      expect(isPassThrough(res)).toBe(true);
    });

    it('does not treat a health-prefixed path as public', () => {
      process.env.OWNER_SECRET = 'correct-horse-battery-staple';
      // Only the exact /api/health path is exempt; nothing may widen it by prefix.
      expect(middleware(request('/api/health-secrets')).status).toBe(401);
      expect(middleware(request('/api/health/details')).status).toBe(401);
    });
  });

  it('ignores non-API routes entirely', () => {
    delete process.env.OWNER_SECRET;
    expect(isPassThrough(middleware(request('/dashboard')))).toBe(true);
  });
});
