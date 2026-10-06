// ============================================================================
// QuantChat - auth-gate public paths (P0-2)
//
// The login footer links to /terms, /privacy and /support. These routes MUST
// be public: before the fix the auth gate bounced logged-out visitors from
// them back to /login (dead loop) and they 404'd for everyone.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { isPublicPath } from '../auth-gate';

describe('isPublicPath', () => {
  it('keeps the login page public', () => {
    expect(isPublicPath('/login')).toBe(true);
  });

  it.each(['/terms', '/privacy', '/support'])('keeps %s public (P0-2)', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it('still gates authed routes', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/chat/abc123')).toBe(false);
    expect(isPublicPath('/stories')).toBe(false);
  });

  it('rejects null/unknown paths', () => {
    expect(isPublicPath(null)).toBe(false);
    expect(isPublicPath('/terms/')).toBe(false);
    expect(isPublicPath('')).toBe(false);
  });
});
