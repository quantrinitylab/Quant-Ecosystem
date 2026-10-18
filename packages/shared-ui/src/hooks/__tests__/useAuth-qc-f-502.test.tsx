// @vitest-environment jsdom
// ============================================================================
// Shared UI - useAuth QC-F-502: HTTP 5xx must NOT mint an offline session
// ============================================================================
//
// QC-F-502 (P0): a fresh login succeeds (200 + token) but GET /auth/me throws
// server-side, so the userinfo proxy passes a 500 through. The old checkAuth
// catch treated every non-401/403 throw as a "network error" and minted a
// fabricated offline identity ({ id: 'offline', ... }), so the gate opened
// the app on an identity the backend never verified — masking the 500.
//
// Band contract (specialist-qc-f-502-buildprep.md §5.3 / §8):
//   NC-502-1  userinfo 500/503 (an HTTP response arrived) -> user null,
//             isAuthenticated false, error = 'userinfo failed: <5xx>',
//             stored token PRESERVED (the token is not at fault; once the
//             server recovers the same token must work).
//   NC-502-1R refreshToken() after a healthy mount, then userinfo 500 ->
//             same honest state (no stale user kept, no offline mint).
//   PIN-502-3 userinfo 401 -> fail-closed: tokens cleared, user null.
//   PIN-502-4 fetch rejects (NO HTTP response at all) -> the pre-existing
//             offline tolerance is unchanged (offline user minted).
//   PIN-502-5 userinfo 200 -> real backend-verified user, no error.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth, configureQuantAuth } from '../useAuth';

const VERIFIED_USER = {
  id: 'user_real_502',
  email: 'fresh@quant.app',
  username: 'freshuser',
  displayName: 'Fresh User',
  role: 'user',
};

function mockFetch(
  impl: (url: string, init?: RequestInit) => { ok: boolean; status?: number; json: unknown },
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const r = impl(url, init);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 401),
      json: async () => r.json,
    } as Response;
  });
}

beforeEach(() => {
  localStorage.clear();
  configureQuantAuth({
    userInfoUrl: '/api/auth/userinfo',
    loginUrl: '/api/auth/login',
    registerUrl: '/api/auth/register',
    logoutUrl: '/api/auth/logout',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useAuth QC-F-502 — HTTP 5xx is an honest server error, never a session', () => {
  it('NC-502-1: userinfo 500 -> no offline mint, error recorded, token preserved', async () => {
    localStorage.setItem('quant_access_token', 'fresh.jwt.token');
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({
        ok: false,
        status: 500,
        json: { success: false, error: { code: 'INTERNAL_ERROR' } },
      })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('userinfo failed: 500');
    // The token itself is not invalid — a 5xx must not destroy it.
    expect(localStorage.getItem('quant_access_token')).toBe('fresh.jwt.token');
  });

  it('NC-502-1b: userinfo 503 -> same honest 5xx state (no offline mint)', async () => {
    localStorage.setItem('quant_access_token', 'fresh.jwt.token');
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ ok: false, status: 503, json: { success: false } })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('userinfo failed: 503');
    expect(localStorage.getItem('quant_access_token')).toBe('fresh.jwt.token');
  });

  it('NC-502-1R: refreshToken() hitting userinfo 500 drops the session honestly', async () => {
    localStorage.setItem('quant_access_token', 'fresh.jwt.token');
    let userinfoStatus = 200;
    vi.stubGlobal(
      'fetch',
      mockFetch(() =>
        userinfoStatus === 200
          ? { ok: true, json: { success: true, data: VERIFIED_USER } }
          : { ok: false, status: userinfoStatus, json: { success: false } },
      ),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user?.id).toBe('user_real_502');

    userinfoStatus = 500;
    await act(async () => {
      await result.current.refreshToken();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('userinfo failed: 500');
    expect(localStorage.getItem('quant_access_token')).toBe('fresh.jwt.token');
  });

  it('PIN-502-3: userinfo 401 stays fail-closed (token cleared, no user, no offline mint)', async () => {
    localStorage.setItem('quant_access_token', 'stale.token');
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ ok: false, status: 401, json: {} })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });

  it('PIN-502-4: a rejected fetch (no HTTP response) keeps the existing offline tolerance', async () => {
    localStorage.setItem('quant_access_token', 'fresh.jwt.token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Pre-existing design, explicitly pinned by the brief: with NO HTTP
    // response the hook does not log the user out and shows the offline
    // placeholder. Only an actual HTTP 5xx response changes behaviour.
    expect(result.current.user?.id).toBe('offline');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('PIN-502-5: userinfo 200 resolves the real verified user with no error', async () => {
    localStorage.setItem('quant_access_token', 'fresh.jwt.token');
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ ok: true, json: { success: true, data: VERIFIED_USER } })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.user?.id).toBe('user_real_502');
    expect(result.current.error).toBeNull();
  });
});
