import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  checkSameOrigin,
  clearSessionCookies,
  getRefreshCredential,
  getRequestBearerToken,
  readCookie,
  setSessionCookies,
} from '../session-cookies';

function setCookiesOf(resp: NextResponse): string[] {
  return resp.headers.getSetCookie();
}

describe('QC-F-154 session-cookies helper', () => {
  describe('setSessionCookies', () => {
    it('sets the access cookie HttpOnly with a 1h maxAge on /', () => {
      const resp = NextResponse.json({});
      setSessionCookies(resp, { accessToken: 'ACC' });
      const access = setCookiesOf(resp).find((c) => c.startsWith(`${ACCESS_COOKIE_NAME}=ACC`));
      expect(access).toBeDefined();
      expect(access).toContain('Path=/');
      expect(access).toContain(`Max-Age=${ACCESS_COOKIE_MAX_AGE}`);
      expect(ACCESS_COOKIE_MAX_AGE).toBe(3600);
      expect(access).toContain('HttpOnly');
      expect(access).toMatch(/samesite=lax/i);
    });

    it('sets the refresh cookie path-scoped to /api/auth with a 30d maxAge', () => {
      const resp = NextResponse.json({});
      setSessionCookies(resp, { accessToken: 'ACC', refreshToken: 'REF' });
      const refresh = setCookiesOf(resp).find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=REF`));
      expect(refresh).toBeDefined();
      expect(refresh).toContain(`Path=${REFRESH_COOKIE_PATH}`);
      expect(REFRESH_COOKIE_PATH).toBe('/api/auth');
      expect(refresh).toContain(`Max-Age=${REFRESH_COOKIE_MAX_AGE}`);
      expect(REFRESH_COOKIE_MAX_AGE).toBe(30 * 24 * 3600);
      expect(refresh).toContain('HttpOnly');
    });

    it('does not set a refresh cookie when no refresh token is issued (never stores access-as-refresh)', () => {
      const resp = NextResponse.json({});
      setSessionCookies(resp, { accessToken: 'ACC' });
      expect(setCookiesOf(resp).some((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))).toBe(false);
    });

    it('writes the one-release legacy token mirror', () => {
      const resp = NextResponse.json({});
      setSessionCookies(resp, { accessToken: 'ACC' });
      const legacy = setCookiesOf(resp).find((c) => c.startsWith('token=ACC'));
      expect(legacy).toBeDefined();
      expect(legacy).toContain('HttpOnly');
    });
  });

  describe('clearSessionCookies', () => {
    it('expires the refresh cookie on BOTH /api/auth and / (path-mismatch would resurrect it)', () => {
      const resp = NextResponse.json({});
      clearSessionCookies(resp);
      const expired = setCookiesOf(resp).filter((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
      expect(expired).toHaveLength(2);
      expect(expired.some((c) => c.includes(`Path=${REFRESH_COOKIE_PATH}`) && c.includes('Max-Age=0'))).toBe(true);
      expect(expired.some((c) => c.includes('Path=/;') && c.includes('Max-Age=0'))).toBe(true);
    });

    it('expires the access cookie and legacy mirror', () => {
      const resp = NextResponse.json({});
      clearSessionCookies(resp);
      const all = setCookiesOf(resp).join('\n');
      expect(all).toContain(`${ACCESS_COOKIE_NAME}=;`);
      expect(all).toContain('token=;');
      expect(setCookiesOf(resp).every((c) => c.includes('Max-Age=0'))).toBe(true);
    });
  });

  describe('readCookie', () => {
    it('reads via NextRequest cookies when present', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        headers: { cookie: `${ACCESS_COOKIE_NAME}=abc123` },
      });
      expect(readCookie(req, ACCESS_COOKIE_NAME)).toBe('abc123');
    });

    it('parses a raw Cookie header for plain Request objects', () => {
      const req = new Request('http://localhost:3000/api/x', {
        headers: { cookie: `theme=dark; ${REFRESH_COOKIE_NAME}=r456; other=1` },
      });
      expect(readCookie(req, REFRESH_COOKIE_NAME)).toBe('r456');
    });

    it('returns null when the cookie is absent', () => {
      const req = new NextRequest('http://localhost:3000/api/x');
      expect(readCookie(req, ACCESS_COOKIE_NAME)).toBeNull();
    });
  });

  describe('getRequestBearerToken', () => {
    it('prefers the Authorization header (old-client compat)', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        headers: { authorization: 'Bearer HDR', cookie: `${ACCESS_COOKIE_NAME}=CK` },
      });
      expect(getRequestBearerToken(req)).toBe('HDR');
    });

    it('falls back to the HttpOnly cookie when no header is present', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        headers: { cookie: `${ACCESS_COOKIE_NAME}=CK` },
      });
      expect(getRequestBearerToken(req)).toBe('CK');
    });

    it('returns null when neither exists', () => {
      const req = new NextRequest('http://localhost:3000/api/x');
      expect(getRequestBearerToken(req)).toBeNull();
    });
  });

  describe('getRefreshCredential', () => {
    it('prefers the refresh cookie over the body', () => {
      const req = new NextRequest('http://localhost:3000/api/auth/refresh', {
        method: 'POST',
        headers: { cookie: `${REFRESH_COOKIE_NAME}=COOKIE_R` },
      });
      expect(getRefreshCredential(req, 'BODY_R')).toBe('COOKIE_R');
    });

    it('accepts the legacy body field when no cookie exists (Release-A compat)', () => {
      const req = new NextRequest('http://localhost:3000/api/auth/refresh', { method: 'POST' });
      expect(getRefreshCredential(req, 'BODY_REFRESH_TOK')).toBe('BODY_REFRESH_TOK');
    });

    it('rejects short/garbage body values', () => {
      const req = new NextRequest('http://localhost:3000/api/auth/refresh', { method: 'POST' });
      expect(getRefreshCredential(req, 'short')).toBeNull();
      expect(getRefreshCredential(req, null)).toBeNull();
    });
  });

  describe('checkSameOrigin (CSRF)', () => {
    it('allows GET unconditionally', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        headers: { origin: 'https://evil.example.com' },
      });
      expect(checkSameOrigin(req)).toBe(true);
    });

    it('allows same-origin mutating requests', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      });
      expect(checkSameOrigin(req)).toBe(true);
    });

    it('rejects cross-origin mutating requests', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        method: 'POST',
        headers: { origin: 'https://evil.example.com' },
      });
      expect(checkSameOrigin(req)).toBe(false);
    });

    it('rejects on a cross-origin Referer when Origin is absent', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        method: 'DELETE',
        headers: { referer: 'https://evil.example.com/page' },
      });
      expect(checkSameOrigin(req)).toBe(false);
    });

    it('allows requests with no Origin/Referer (non-browser callers: curl, tests, server fetch)', () => {
      const req = new NextRequest('http://localhost:3000/api/x', { method: 'POST' });
      expect(checkSameOrigin(req)).toBe(true);
    });

    it('fails closed on an unparseable Origin', () => {
      const req = new NextRequest('http://localhost:3000/api/x', {
        method: 'POST',
        headers: { origin: 'not-a-url' },
      });
      expect(checkSameOrigin(req)).toBe(false);
    });
  });
});
