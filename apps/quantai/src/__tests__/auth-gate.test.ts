import { describe, it, expect } from 'vitest';
import { LOGIN_REDIRECT_URL, mustRedirectToLogin } from '../lib/auth-gate';

// P0 (2026-10-10, user-locked): "quantai to login ke bina chalna hi nahi
// chahiye" — guests must be redirected to /login instead of seeing the
// chat UI.

describe('auth-gate', () => {
  it('redirects guests once the auth check has completed', () => {
    expect(mustRedirectToLogin(true, false)).toBe(true);
  });

  it('never redirects signed-in users', () => {
    expect(mustRedirectToLogin(true, true)).toBe(false);
  });

  it('never redirects while the auth check is still running (no bounce for signed-in users)', () => {
    expect(mustRedirectToLogin(false, false)).toBe(false);
    expect(mustRedirectToLogin(false, true)).toBe(false);
  });

  it('sends guests to the in-app /login page with a same-origin return path (no open redirect)', () => {
    expect(LOGIN_REDIRECT_URL).toBe('/login?returnTo=%2F');
    const url = new URL(LOGIN_REDIRECT_URL, 'https://quantai.quantrinity.in');
    expect(url.origin).toBe('https://quantai.quantrinity.in');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('returnTo')).toBe('/');
  });
});
