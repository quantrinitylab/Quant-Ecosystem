// @vitest-environment node
// ============================================================================
// quantmail — edge middleware tests (double-boot kill, fix/qm-root-double-boot)
//
// The middleware must redirect provably-signed-out visitors (no
// `quantmail_refresh` cookie) off guarded paths server-side, before the app
// shell boots — and must NEVER touch public paths or requests that carry the
// session cookie. Public-path list must mirror AuthGuard.tsx exactly.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  REFRESH_COOKIE_NAME,
  buildLoginRedirect,
  isPublicPath,
  middleware,
} from '../middleware';

const req = (url: string, withCookie: boolean) =>
  new NextRequest(url, {
    headers: withCookie ? { cookie: `${REFRESH_COOKIE_NAME}=deadbeef` } : {},
  });

const locationOf = (url: string, withCookie: boolean): string | null => {
  const res = middleware(req(url, withCookie));
  return res.headers.get('location');
};

describe('isPublicPath mirrors AuthGuard', () => {
  const publicPaths = [
    'http://x.test/login',
    'http://x.test/register',
    'http://x.test/forgot-password',
    'http://x.test/reset-password',
    'http://x.test/help',
    'http://x.test/terms',
    'http://x.test/privacy',
    'http://x.test/sso',
    'http://x.test/sso/callback?x=1',
    'http://x.test/oauth',
    'http://x.test/oauth/authorize',
    'http://x.test/quantgit',
    'http://x.test/quantgit/acme/repo',
    'http://x.test/marketing',
    'http://x.test/lab',
    'http://x.test/lab/experiment',
    // Public invite / group-join previews (QM-SCREEN-018) — signed-out guests
    // must reach them; a middleware regression here breaks sharing flows.
    'http://x.test/invite/abc123',
    'http://x.test/groups/join/xyz',
    // Public calendar booking links (fix/qm-booking-guest-bounce, PR #975):
    // fully public signed-out flow incl. honest dead-link state.
    'http://x.test/calendar/booking/some-slug',
    // Public Drive share landing page + legacy redirect source: share links
    // must open for signed-out recipients (documented public page).
    'http://x.test/drive/share/abc123token',
    'http://x.test/documents/public/share/abc123token',
  ];
  for (const url of publicPaths) {
    it(`does not redirect ${new URL(url).pathname} (signed out)`, () => {
      expect(isPublicPath(new URL(url).pathname)).toBe(true);
      expect(locationOf(url, false)).toBeNull();
    });
  }

  const guardedPaths = [
    'http://x.test/',
    // NOTE (fix/qm-unknown-route-404): /inbox is not a real app route (root /
    // is the inbox) — it is unknown and must 404, never bounce. It lives in
    // the unknown-paths block below now.
    'http://x.test/thread/abc123',
    'http://x.test/settings/account',
    'http://x.test/people',
    'http://x.test/calendar',
    'http://x.test/drive',
    'http://x.test/contacts',
    'http://x.test/settings',
    'http://x.test/compose',
  ];
  for (const url of guardedPaths) {
    it(`redirects ${new URL(url).pathname} when signed out`, () => {
      expect(isPublicPath(new URL(url).pathname)).toBe(false);
      const loc = locationOf(url, false);
      expect(loc).not.toBeNull();
      expect(loc).toContain('/login');
    });
  }

  // Unknown URLs must reach the branded 404, never bounce to /login
  // (fix/qm-unknown-route-404).
  const unknownPaths = [
    'http://x.test/no-such-page-xyz',
    'http://x.test/inbox',
    'http://x.test/invitations',
  ];
  for (const url of unknownPaths) {
    it(`does not redirect unknown ${new URL(url).pathname} when signed out`, () => {
      expect(isPublicPath(new URL(url).pathname)).toBe(false);
      expect(locationOf(url, false)).toBeNull();
    });
  }

  for (const url of guardedPaths) {
    it(`lets ${new URL(url).pathname} through when the session cookie is present`, () => {
      expect(locationOf(url, true)).toBeNull();
    });
  }
});

describe('buildLoginRedirect returnTo rule (mirrors AuthGuard)', () => {
  it('redirects / to plain /login with no returnTo', () => {
    const res = buildLoginRedirect(req('http://x.test/', false));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.search).toBe('');
  });

  it('preserves path + query as returnTo for deep links', () => {
    const res = buildLoginRedirect(req('http://x.test/calendar?view=week', false));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('returnTo')).toBe('/calendar?view=week');
  });

  it('issues a temporary (307) redirect, never permanent', () => {
    const res = middleware(req('http://x.test/', false));
    expect(res.status).toBe(307);
  });
});
