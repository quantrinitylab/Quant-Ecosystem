// ============================================================================
// QuantAI — auth identity honesty regression tests
// ============================================================================
//
// getAuthUser() must NEVER fabricate an identity. A token without a stored
// profile is not a valid session — callers treat null as unauthenticated and
// redirect to login / SSO. (Previously it invented id 'usr_quant'.)

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('getAuthUser identity honesty', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it('returns null when a token exists but no user profile is stored (no fabrication)', async () => {
    const { getAuthUser, getAuthToken } = await import('../lib/auth');
    window.localStorage.setItem('quant_access_token', 'some-unvalidated-token');
    expect(getAuthToken()).toBe('some-unvalidated-token');
    expect(getAuthUser()).toBeNull();
  });

  it('returns the stored profile when one exists', async () => {
    const { getAuthUser } = await import('../lib/auth');
    const profile = { id: 'user-123', email: 'real@quantmail.in', name: 'Real User', plan: 'pro' as const };
    window.localStorage.setItem('quant_user', JSON.stringify(profile));
    expect(getAuthUser()).toEqual(profile);
  });

  it('returns null when there is no token and no profile', async () => {
    const { getAuthUser } = await import('../lib/auth');
    expect(getAuthUser()).toBeNull();
  });
});
