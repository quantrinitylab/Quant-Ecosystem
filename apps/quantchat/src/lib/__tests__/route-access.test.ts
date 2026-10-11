// ============================================================================
// QuantChat - route access registry
//
// The registry is the single source of truth the auth gate classifies with.
// These tests pin the classification contract: public paths stay public
// (P0-2 legal pages + the QuantMail password-recovery handoff), real app
// routes stay gated, and anything else is 'unknown' so the router can show
// a real 404 instead of masking bad links behind a /login bounce.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { classifyPath, isPublicPath, PUBLIC_PATHS, APP_ROUTES } from '../route-access';

describe('isPublicPath', () => {
  it('keeps the login page public', () => {
    expect(isPublicPath('/login')).toBe(true);
  });

  it.each(['/terms', '/privacy', '/support'])('keeps %s public (P0-2)', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it('keeps /forgot-password public so the QuantMail recovery handoff is reachable logged-out', () => {
    expect(isPublicPath('/forgot-password')).toBe(true);
  });

  it('does not treat app routes as public', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/settings')).toBe(false);
    expect(isPublicPath('/calls')).toBe(false);
    expect(isPublicPath('/chat/abc123')).toBe(false);
  });

  it('rejects null/empty/look-alike paths', () => {
    expect(isPublicPath(null)).toBe(false);
    expect(isPublicPath('')).toBe(false);
    expect(isPublicPath('/terms/')).toBe(false);
    expect(isPublicPath('/login/extra')).toBe(false);
  });
});

describe('classifyPath', () => {
  it.each([
    '/',
    '/camera',
    '/channels',
    '/map',
    '/meet',
    '/memories',
    '/new-chat',
    '/profile',
    '/reels',
    '/register',
    '/spotlight',
    '/stories',
  ])('classifies App Router route %s as gated app route', (path) => {
    expect(classifyPath(path)).toBe('app');
  });

  it.each(['/bitmoji', '/calls', '/discover', '/settings'])(
    'classifies Pages Router route %s as gated app route (P0: these shipped ungated)',
    (path) => {
      expect(classifyPath(path)).toBe('app');
    },
  );

  it.each(['/chat/abc123', '/chat/01HXYZ', '/meet/room-42'])(
    'classifies dynamic route %s as gated app route',
    (path) => {
      expect(classifyPath(path)).toBe('app');
    },
  );

  it.each(['/login', '/terms', '/privacy', '/support', '/forgot-password'])(
    'classifies %s as public',
    (path) => {
      expect(classifyPath(path)).toBe('public');
    },
  );

  it.each(['/nope', '/chat', '/chat/', '/chat/a/b', '/settings/extra', '/admin', '/api/settings'])(
    'classifies %s as unknown so it reaches the 404, not a login bounce',
    (path) => {
      expect(classifyPath(path)).toBe('unknown');
    },
  );

  it('classifies null/empty as unknown', () => {
    expect(classifyPath(null)).toBe('unknown');
    expect(classifyPath('')).toBe('unknown');
  });

  it('registry is self-consistent: no path is both public and an app route', () => {
    for (const p of APP_ROUTES) {
      expect(PUBLIC_PATHS.has(p)).toBe(false);
    }
  });
});
