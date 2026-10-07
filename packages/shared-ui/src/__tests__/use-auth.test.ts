// @vitest-environment jsdom
// ============================================================================
// Shared UI - useAuth Hook Tests (real, backend-verified identity)
// ============================================================================
//   Proves the hook resolves a REAL backend-verified user from the userinfo
//   endpoint and FAILS CLOSED (never fabricates a user / token).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth, configureQuantAuth } from '../hooks/useAuth';

const VERIFIED_USER = {
  id: 'user_real_123',
  email: 'real@quant.app',
  username: 'realuser',
  displayName: 'Real User',
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
  localStorage.clear();
});

describe('useAuth — mount hydration', () => {
  it('starts unauthenticated with no stored token (no fabrication)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ ok: false, status: 401, json: {} })),
    );
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('resolves a real backend-verified user from a stored token', async () => {
    localStorage.setItem('quant_access_token', 'real.jwt.token');
    const fetchSpy = mockFetch((url) => {
      if (url === '/api/auth/userinfo')
        return { ok: true, json: { success: true, data: VERIFIED_USER } };
      return { ok: false, json: {} };
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user?.id).toBe('user_real_123');
    // userinfo was called with the bearer token (server-side verification).
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/userinfo',
      expect.objectContaining({ headers: { Authorization: 'Bearer real.jwt.token' } }),
    );
  });

  it('fails closed when the token is invalid (401): clears token, no user', async () => {
    localStorage.setItem('quant_access_token', 'stale.token');
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ ok: false, status: 401, json: {} })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });
});

describe('useAuth — login', () => {
  it('exchanges credentials for a real token then resolves the verified user', async () => {
    const fetchSpy = mockFetch((url) => {
      if (url === '/api/auth/login') {
        return { ok: true, json: { data: { accessToken: 'issued.jwt', refreshToken: 'r.jwt' } } };
      }
      if (url === '/api/auth/userinfo') return { ok: true, json: { data: VERIFIED_USER } };
      return { ok: false, json: {} };
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('real@quant.app', 'pw');
    });

    expect(result.current.user?.id).toBe('user_real_123');
    expect(localStorage.getItem('quant_access_token')).toBe('issued.jwt');
  });

  it('fails closed on bad credentials — no user, no token fabricated', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ ok: false, status: 401, json: {} })),
    );
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('bad@quant.app', 'wrong');
      }),
    ).rejects.toBeTruthy();

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });
});

describe('useAuth — logout', () => {
  it('clears the session', async () => {
    localStorage.setItem('quant_access_token', 'real.jwt.token');
    vi.stubGlobal(
      'fetch',
      mockFetch((url) => {
        if (url === '/api/auth/userinfo') return { ok: true, json: { data: VERIFIED_USER } };
        return { ok: true, json: {} };
      }),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });
});
