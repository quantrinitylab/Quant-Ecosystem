// @vitest-environment jsdom
// ============================================================================
// Shared UI - useAuth SSO handoff tests (QC-F-085)
// ============================================================================
//
// Regression: useAuth used to fall back to `consumed.ticket` as the session
// token (`session?.token || consumed.ticket`), and the bridge stored the raw
// FOREIGN candidate token into every session key. A cross-app arrival was
// therefore "logged in" on a token this app's backend rejects — 401s, a
// fail-closed clear, and a bounce to /login with the ticket already stripped
// from the URL. The handoff must exchange first and persist ONLY the native
// pair; on exchange failure the user is honestly logged out.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';

const FOREIGN_JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJxdWFudG1haWwiLCJhdWQiOiJxdWFudC1lY29zeXN0ZW0iLCJzdWIiOiJmb3JlaWduLXVzZXItMSJ9.foreignsig';
const NATIVE_ACCESS = 'qc_native_access_after_exchange';
const NATIVE_REFRESH = 'qc_native_refresh_after_exchange';
const ALL_KEYS = [
  'quant_access_token',
  'quant_auth_token',
  'token',
  'quant_token',
  'quantchat_access_token',
  'quant_refresh_token',
];

function makeTicket(token: string): string {
  return Buffer.from(
    JSON.stringify({
      uid: 'foreign-user-1',
      email: 'foreign@quantmail.in',
      name: 'Foreign User',
      tier: 'free',
      app: 'quantchat',
      token,
      iat: Date.now(),
      exp: Date.now() + 5 * 60 * 1000,
      nonce: 'qc-f-085-hook-nonce',
    }),
  ).toString('base64url');
}

function userinfoOk(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        id: 'foreign-user-1',
        email: 'foreign@quantmail.in',
        username: 'foreign',
        displayName: 'Foreign User',
      },
    }),
    { status: 200 },
  );
}

function mockServer(exchangeImpl: () => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      if (String(input) === '/api/auth/sso/exchange') return exchangeImpl();
      return userinfoOk();
    }),
  );
}

describe('useAuth - SSO handoff (QC-F-085)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', `/?__quant_sso_ticket=${makeTicket(FOREIGN_JWT)}`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('establishes the session on the EXCHANGED native token, never the ticket or foreign token', async () => {
    mockServer(
      () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: NATIVE_ACCESS, refreshToken: NATIVE_REFRESH, expiresIn: 3600 },
          }),
          { status: 200 },
        ),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user?.id).toBe('foreign-user-1');
    expect(localStorage.getItem('quant_access_token')).toBe(NATIVE_ACCESS);
    expect(localStorage.getItem('quant_refresh_token')).toBe(NATIVE_REFRESH);
    for (const key of ALL_KEYS) {
      expect(localStorage.getItem(key), key).not.toBe(FOREIGN_JWT);
    }
  });

  it('stays honestly logged out when the exchange fails — no ticket fallback, nothing stored', async () => {
    mockServer(
      () =>
        new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), {
          status: 401,
        }),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    for (const key of ALL_KEYS) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
  });
});
