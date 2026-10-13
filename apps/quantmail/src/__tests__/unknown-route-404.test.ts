// @vitest-environment node
// ============================================================================
// quantmail — unknown-route 404 (fix/qm-unknown-route-404)
//
// Signed-out visitors to unknown URLs must reach the branded 404
// (src/app/not-found.tsx), not bounce to /login?returnTo=<dead-url>.
// The edge middleware and AuthGuard share isKnownAppPath() for this; the
// three guard cases are: public -> through, known private -> /login bounce,
// unknown -> through (framework renders the 404).
//
// Drift protection: the first suite walks src/app for page.tsx/route.ts and
// fails if any real route file lives under a segment classified neither
// public nor known — so adding a page without updating edge-public-paths.ts
// breaks CI instead of silently 404ing signed-out visitors.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import {
  REFRESH_COOKIE_NAME,
  isKnownAppPath,
  isPublicPath,
  middleware,
} from '../middleware';

const appDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'app');

/**
 * Every page.tsx / route.ts under src/app becomes a probe path: dynamic
 * segments are substituted with a literal so the guard classifiers can run
 * on it. Private folders (_*), route groups ((*)), parallel slots (@*) and
 * /api (the middleware matcher excludes it) are skipped.
 */
function collectRouteProbes(dir: string, base: string): string[] {
  const probes: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'api') continue;
    if (entry.startsWith('_') || entry.startsWith('(') || entry.startsWith('@')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      probes.push(...collectRouteProbes(full, `${base}/${entry}`));
    } else if (entry === 'page.tsx' || entry === 'route.ts') {
      const probe = (base === '' ? '/' : base)
        .replace(/\[\[\.\.\.[^\]]+\]\]/g, 'probe123')
        .replace(/\[[^\]]+\]/g, 'probe123');
      probes.push(probe);
    }
  }
  return probes;
}

describe('guard parity: every real route file is classified public-or-known', () => {
  const probes = collectRouteProbes(appDir, '');
  // Sanity: the walk must actually find the route surface (51 pages + 2
  // route handlers on origin/main at the time of writing).
  it('finds the app route surface', () => {
    expect(probes.length).toBeGreaterThan(40);
    expect(probes).toContain('/');
    expect(probes).toContain('/calendar/booking/probe123');
    expect(probes).toContain('/thread/probe123');
    expect(probes).toContain('/.well-known/openid-configuration');
  });

  for (const probe of probes) {
    it(`route ${probe} is public-or-known (no silent 404 for signed-out visitors)`, () => {
      expect(isPublicPath(probe) || isKnownAppPath(probe)).toBe(true);
    });
  }
});

describe('isKnownAppPath classification', () => {
  const knownPrivate = [
    '/',
    '/calendar',
    '/calendar/event/evt-1',
    '/drive',
    '/drive/doc/doc-1',
    '/thread/msg-1',
    '/people/person-1',
    '/settings',
    '/settings/account',
    '/admin',
    '/admin/domains',
    '/workspaces/ws-1',
    '/compose',
    '/search',
    '/notifications',
    '/scheduled',
    // OIDC discovery route handler: known (keeps today's login bounce, not
    // a 404) — making it public per the OIDC spec is a separate finding in
    // the qm-auto queue.
    '/.well-known/openid-configuration',
  ];
  for (const path of knownPrivate) {
    it(`classifies ${path} as a known private route`, () => {
      expect(isPublicPath(path)).toBe(false);
      expect(isKnownAppPath(path)).toBe(true);
    });
  }

  const unknown = [
    '/no-such-page-xyz',
    '/invitations', // dead link shipped in the UI; must 404, not bounce
    '/inbox', // not a route (root / is the inbox); must 404, not bounce
    '/settingsxyz',
    '/drivexyz',
    '/calendarx',
  ];
  for (const path of unknown) {
    it(`classifies ${path} as unknown (branded 404, never a login bounce)`, () => {
      expect(isPublicPath(path)).toBe(false);
      expect(isKnownAppPath(path)).toBe(false);
    });
  }

  it('never classifies a public path as known (public wins)', () => {
    expect(isKnownAppPath('/calendar/booking/some-slug')).toBe(false);
    expect(isKnownAppPath('/drive/share/abc123')).toBe(false);
    expect(isKnownAppPath('/login')).toBe(false);
    expect(isKnownAppPath('/invite/abc')).toBe(false);
  });
});

const req = (url: string, withCookie: boolean) =>
  new NextRequest(url, {
    headers: withCookie ? { cookie: `${REFRESH_COOKIE_NAME}=deadbeef` } : {},
  });

const locationOf = (url: string, withCookie: boolean): string | null => {
  const res = middleware(req(url, withCookie));
  return res.headers.get('location');
};

describe('middleware: unknown routes reach the branded 404 signed-out', () => {
  const deadUrls = [
    'http://x.test/no-such-page-xyz',
    'http://x.test/invitations',
    'http://x.test/inbox',
    'http://x.test/no-such-page-xyz?x=1',
  ];
  for (const url of deadUrls) {
    it(`does NOT redirect ${new URL(url).pathname} when signed out`, () => {
      expect(locationOf(url, false)).toBeNull();
    });
  }

  it('still bounces known private routes to /login with returnTo when signed out', () => {
    const loc = new URL(locationOf('http://x.test/thread/msg-1', false)!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('returnTo')).toBe('/thread/msg-1');

    const deep = new URL(locationOf('http://x.test/settings/account', false)!);
    expect(deep.pathname).toBe('/login');
    expect(deep.searchParams.get('returnTo')).toBe('/settings/account');
  });

  it('still bounces / to plain /login when signed out (no regression)', () => {
    const loc = new URL(locationOf('http://x.test/', false)!);
    expect(loc.pathname).toBe('/login');
    expect(loc.search).toBe('');
  });

  it('lets unknown routes through when the session cookie is present too', () => {
    expect(locationOf('http://x.test/no-such-page-xyz', true)).toBeNull();
  });
});
