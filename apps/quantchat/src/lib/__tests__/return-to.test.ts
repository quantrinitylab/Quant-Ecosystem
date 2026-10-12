// ============================================================================
// QuantChat - Post-login return target (QC-F-049)
//
// Regression contract: a logged-out deep link must survive the login
// bounce. The gate encodes the destination as ?returnTo=, and login
// resolves it back — but ONLY for validated internal app routes. These
// tests pin both halves plus the open-redirect rejections (CWE-601):
// on the pre-fix code there was no return-to module at all and the gate
// redirected to a bare '/login' while login success hardcoded '/'.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildLoginRedirect,
  resolveReturnTo,
  sanitizeInternalReturnPath,
} from '../return-to';

describe('buildLoginRedirect (gate side)', () => {
  it('preserves a dynamic app route as an encoded returnTo', () => {
    expect(buildLoginRedirect('/chat/conv-123')).toBe(
      '/login?returnTo=%2Fchat%2Fconv-123',
    );
  });

  it('preserves a static app route', () => {
    expect(buildLoginRedirect('/settings')).toBe('/login?returnTo=%2Fsettings');
  });

  it('preserves the query suffix as part of the destination', () => {
    expect(buildLoginRedirect('/meet/room-9', '?code=4821')).toBe(
      '/login?returnTo=%2Fmeet%2Froom-9%3Fcode%3D4821',
    );
  });

  it('preserves a hash suffix as part of the destination', () => {
    expect(buildLoginRedirect('/chat/conv-1', '#reply')).toBe(
      '/login?returnTo=%2Fchat%2Fconv-1%23reply',
    );
  });

  it('adds no parameter for the BARE app root (already the default target)', () => {
    expect(buildLoginRedirect('/')).toBe('/login');
    expect(buildLoginRedirect('/', '')).toBe('/login');
    expect(buildLoginRedirect('/', null)).toBe('/login');
  });

  it('preserves a root-route query suffix — root query is real app state (PR #961 review)', () => {
    expect(buildLoginRedirect('/', '?view=inbox&lens=snoozed')).toBe(
      '/login?returnTo=%2F%3Fview%3Dinbox%26lens%3Dsnoozed',
    );
    expect(buildLoginRedirect('/', '?utm=x')).toBe('/login?returnTo=%2F%3Futm%3Dx');
  });

  it('preserves a root-route hash suffix', () => {
    expect(buildLoginRedirect('/', '#join')).toBe('/login?returnTo=%2F%23join');
  });

  it('adds no parameter when there is no pathname yet', () => {
    expect(buildLoginRedirect(null)).toBe('/login');
    expect(buildLoginRedirect('')).toBe('/login');
  });

  it('never builds a returnTo for a non-app pathname', () => {
    expect(buildLoginRedirect('/login')).toBe('/login');
    expect(buildLoginRedirect('/support')).toBe('/login');
    expect(buildLoginRedirect('/no-such-route')).toBe('/login');
  });
});

describe('resolveReturnTo (login side)', () => {
  it('returns a valid app route unchanged', () => {
    expect(resolveReturnTo('/chat/conv-123')).toBe('/chat/conv-123');
    expect(resolveReturnTo('/settings')).toBe('/settings');
    expect(resolveReturnTo('/')).toBe('/');
  });

  it('keeps the query and hash of a valid target', () => {
    expect(resolveReturnTo('/meet/room-9?code=4821')).toBe('/meet/room-9?code=4821');
    expect(resolveReturnTo('/chat/conv-1#reply')).toBe('/chat/conv-1#reply');
    // The root itself is an app route; its query is state, not decoration.
    expect(resolveReturnTo('/?view=inbox&lens=snoozed')).toBe('/?view=inbox&lens=snoozed');
  });

  it('falls back to / when absent or empty', () => {
    expect(resolveReturnTo(null)).toBe('/');
    expect(resolveReturnTo(undefined)).toBe('/');
    expect(resolveReturnTo('')).toBe('/');
    expect(resolveReturnTo('   ')).toBe('/');
  });

  it('rejects absolute and protocol-relative URLs (open redirect)', () => {
    expect(resolveReturnTo('https://evil.example/chat/1')).toBe('/');
    expect(resolveReturnTo('http://evil.example/')).toBe('/');
    expect(resolveReturnTo('//evil.example/chat/1')).toBe('/');
    expect(resolveReturnTo('javascript:alert(1)')).toBe('/');
  });

  it('rejects backslash smuggling', () => {
    expect(resolveReturnTo('/\\evil.example')).toBe('/');
    expect(resolveReturnTo('/chat\\@evil.example')).toBe('/');
  });

  it('rejects /login itself (redirect loop) and other public paths', () => {
    expect(resolveReturnTo('/login')).toBe('/');
    expect(resolveReturnTo('/login?returnTo=/chat/1')).toBe('/');
    expect(resolveReturnTo('/support')).toBe('/');
    expect(resolveReturnTo('/terms')).toBe('/');
  });

  it('rejects unknown paths instead of landing on a 404 after login', () => {
    expect(resolveReturnTo('/no-such-route')).toBe('/');
    expect(resolveReturnTo('/chat/')).toBe('/');
    expect(resolveReturnTo('/chat/a/b')).toBe('/');
  });

  it('rejects values with whitespace or control characters', () => {
    expect(resolveReturnTo('/chat/a b')).toBe('/');
    expect(resolveReturnTo('/chat/a\nb')).toBe('/');
  });

  it('round-trips with buildLoginRedirect', () => {
    const redirect = buildLoginRedirect('/chat/conv-7', '?focus=latest');
    const param = new URLSearchParams(redirect.split('?')[1]).get('returnTo');
    expect(resolveReturnTo(param)).toBe('/chat/conv-7?focus=latest');
  });

  it('round-trips a root-route suffix with buildLoginRedirect (PR #961 review)', () => {
    const redirect = buildLoginRedirect('/', '?view=inbox&lens=snoozed');
    const param = new URLSearchParams(redirect.slice('/login?'.length)).get('returnTo');
    expect(param).toBe('/?view=inbox&lens=snoozed');
    expect(resolveReturnTo(param)).toBe('/?view=inbox&lens=snoozed');
  });
});

describe('sanitizeInternalReturnPath', () => {
  it('returns null for non-strings', () => {
    expect(sanitizeInternalReturnPath(null)).toBeNull();
    expect(sanitizeInternalReturnPath(undefined)).toBeNull();
    expect(sanitizeInternalReturnPath(42 as unknown as string)).toBeNull();
  });
});
