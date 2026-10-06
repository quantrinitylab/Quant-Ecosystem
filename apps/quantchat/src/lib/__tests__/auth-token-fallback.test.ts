// @vitest-environment jsdom
// ============================================================================
// QuantChat - auth.ts getAuthToken fallback tests
//
// Regression test for the /stories "Failed to fetch stories" bug: getAuthToken
// previously read ONLY the `token` localStorage key, while sessions can be
// persisted under any of `token | quant_access_token | quant_auth_token |
// quant_token | quantchat_access_token` (see lib/auth-session.ts). A session
// stored under a different key produced no Authorization header, the backend
// answered 401, and fetch-based hooks (useStories) surfaced a generic fetch
// error while apiClient-based screens kept working.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { getAuthToken, getAuthHeaders, getAuthHeadersWithContent } from '../auth';

beforeEach(() => {
  localStorage.clear();
});

describe('getAuthToken', () => {
  it('returns null when no token is stored', () => {
    expect(getAuthToken()).toBeNull();
  });

  it('reads the legacy `token` key', () => {
    localStorage.setItem('token', 'tok-legacy');
    expect(getAuthToken()).toBe('tok-legacy');
  });

  it('falls back to `quant_access_token` when `token` is absent', () => {
    localStorage.setItem('quant_access_token', 'tok-access');
    expect(getAuthToken()).toBe('tok-access');
  });

  it('falls back to `quant_auth_token`', () => {
    localStorage.setItem('quant_auth_token', 'tok-auth');
    expect(getAuthToken()).toBe('tok-auth');
  });

  it('falls back to `quant_token`', () => {
    localStorage.setItem('quant_token', 'tok-quant');
    expect(getAuthToken()).toBe('tok-quant');
  });

  it('falls back to `quantchat_access_token`', () => {
    localStorage.setItem('quantchat_access_token', 'tok-qc');
    expect(getAuthToken()).toBe('tok-qc');
  });

  it('prefers `token` when several keys are set', () => {
    localStorage.setItem('quant_access_token', 'tok-access');
    localStorage.setItem('token', 'tok-legacy');
    expect(getAuthToken()).toBe('tok-legacy');
  });
});

describe('getAuthHeaders', () => {
  it('returns an empty object without a token', () => {
    expect(getAuthHeaders()).toEqual({});
  });

  it('returns a Bearer <redacted> a session stored under a non-legacy key', () => {
    localStorage.setItem('quant_access_token', 'tok-access');
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer tok-access' });
  });
});

describe('getAuthHeadersWithContent', () => {
  it('includes Content-Type and Bearer <redacted> a non-legacy key', () => {
    localStorage.setItem('quant_auth_token', 'tok-auth');
    expect(getAuthHeadersWithContent()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-auth',
    });
  });
});
