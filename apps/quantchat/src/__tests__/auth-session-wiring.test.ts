// @vitest-environment jsdom
// ============================================================================
// QuantChat — auth-session wiring regressions
//
// Session-flow defects pinned here:
//  1. bootstrapSession used to fall back to the ACCESS token as the refresh
//     token (`?? accessToken`) — the wrong credential sent to /auth/refresh.
//  2. The apiClient's onTokenRefresh/onAuthError callbacks were never wired
//     anywhere (setCallbacks had zero callers), so rotated tokens were lost
//     on reload and dead sessions were never cleared.
//  3. clearSession only emptied localStorage; the apiClient kept its
//     in-memory bearer, so a "cleared" session kept working until reload.
//  4. The deviceId sent with refresh requests was re-minted on every page
//     load; it is now one stable persisted id.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Stable module-level mock: signOut's network leg is asserted here, and
// the real @quant/api-client fetch would need a live origin in jsdom.
const apiFetchRawMock = vi.hoisted(() =>
  vi.fn(async () => new Response('{}', { status: 200 })),
);
vi.mock('@quant/api-client', () => ({ apiFetchRaw: apiFetchRawMock }));

import { persistSession, bootstrapSession, clearSession, signOut } from '../lib/auth-session';
import { apiClient } from '../services/api-client';

describe('auth-session wiring', () => {
  // Callbacks captured by the first test (module state is fresh per file and
  // wiring is a one-time effect — later session calls reuse the same pair).
  // The type mirrors apiClient.setCallbacks' parameter exactly.
  let wiredCallbacks:
    | {
        onTokenRefresh?: (tokens: import('../types').AuthTokens) => void;
        onAuthError?: () => void;
      }
    | undefined;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('session entry points wire the apiClient session callbacks', () => {
    const setCallbacks = vi.spyOn(apiClient, 'setCallbacks');
    persistSession('access-token', 'refresh-token');
    expect(setCallbacks).toHaveBeenCalled();
    wiredCallbacks = setCallbacks.mock.calls.at(-1)?.[0];
    expect(typeof wiredCallbacks?.onTokenRefresh).toBe('function');
    expect(typeof wiredCallbacks?.onAuthError).toBe('function');
  });

  it('bootstrap does NOT present the access token as a refresh token', () => {
    localStorage.setItem('quant_access_token', 'access-only-token');
    const setTokens = vi.spyOn(apiClient, 'setTokens');

    expect(bootstrapSession()).toBe(true);
    expect(setTokens).toHaveBeenCalledWith('access-only-token', '');
  });

  it('bootstrap uses the real stored refresh token when one exists', () => {
    localStorage.setItem('quant_access_token', 'access-token');
    localStorage.setItem('quant_refresh_token', 'refresh-token');
    const setTokens = vi.spyOn(apiClient, 'setTokens');

    expect(bootstrapSession()).toBe(true);
    expect(setTokens).toHaveBeenCalledWith('access-token', 'refresh-token');
  });

  it('onTokenRefresh persists the rotated pair (survives reload)', () => {
    persistSession('access-1', 'refresh-1');
    wiredCallbacks?.onTokenRefresh?.({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresIn: 3600,
      userId: 'user-1',
    });
    expect(localStorage.getItem('quant_access_token')).toBe('access-2');
    expect(localStorage.getItem('quant_refresh_token')).toBe('refresh-2');
  });

  it('onAuthError clears the dead session (fail closed)', () => {
    persistSession('access-1', 'refresh-1');
    wiredCallbacks?.onAuthError?.();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
    expect(localStorage.getItem('quant_refresh_token')).toBeNull();
  });

  it('clearSession also drops the apiClient in-memory tokens', () => {
    const clearTokens = vi.spyOn(apiClient, 'clearTokens');
    persistSession('access-token', 'refresh-token');
    clearSession();
    expect(clearTokens).toHaveBeenCalled();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });

  it('signOut sends the stored refresh token + access token BEFORE clearing (QC-F-118 revocation)', async () => {
    apiFetchRawMock.mockClear();
    persistSession('access-1', 'refresh-1');
    await signOut();
    expect(apiFetchRawMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: { refreshToken: 'refresh-1' },
        token: 'access-1',
      }),
    );
    // Local traces are gone afterwards regardless.
    expect(localStorage.getItem('quant_access_token')).toBeNull();
    expect(localStorage.getItem('quant_refresh_token')).toBeNull();
  });

  it('device id is stable across bootstraps', () => {
    localStorage.setItem('quant_access_token', 'access-token');
    const setDeviceId = vi.spyOn(apiClient, 'setDeviceId');
    bootstrapSession();
    const first = localStorage.getItem('quantchat_device_id');
    expect(first).toBeTruthy();
    bootstrapSession();
    expect(localStorage.getItem('quantchat_device_id')).toBe(first);
    expect(setDeviceId).toHaveBeenCalledWith(first);
  });
});
