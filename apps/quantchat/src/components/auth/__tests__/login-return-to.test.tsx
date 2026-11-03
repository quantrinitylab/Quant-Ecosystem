// @vitest-environment jsdom
// ============================================================================
// QuantChat - LoginPage post-login destination (QC-F-049)
//
// Regression contract: the destination the auth gate preserved in
// ?returnTo= must be where a successful sign-in actually lands — the
// already-authenticated bounce and the password form both hardcoded '/'
// before this fix, so deep links (notification clicks, cross-app
// handoffs, shared /chat/<id> links) died on the chat list. Unsafe
// returnTo values must never be navigated to (open redirect, CWE-601).
//
// Mocks are module-level with STABLE identities (hoisted state objects
// each test mutates) — fresh identities per render can drive effect
// loops. The SSO-capture effect is inert here: no token parameters are
// put in the URL, so it returns before any fetch.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  user: null as null | { id: string },
  error: null as string | null,
}));

const routerSpy = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const persistSpy = vi.hoisted(() => vi.fn());
const loginSpy = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    error: null,
  })),
);

vi.mock('@quant/shared-ui', () => ({
  useAuth: () => authState,
  UniversalSSOTokenBridge: {
    getInstance: () => ({ decodeUnverifiedHandoffTicket: () => null }),
    validateSafeReturnPath: (value: string) => ({
      isSafe: typeof value === 'string' && value.startsWith('/'),
      sanitizedUrl: value,
    }),
  },
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(async () => ({ ok: false, json: async () => null })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerSpy,
}));

vi.mock('../../../services/api-client', () => ({
  apiClient: { loginWithPassword: loginSpy },
  // QC-F-141: the module now exports the challenge guard; the component
  // branches on it. Real logic, re-stated for the mock.
  isTwoFactorChallenge: (data: unknown): boolean =>
    typeof data === 'object' &&
    data !== null &&
    (data as { twoFactorRequired?: unknown }).twoFactorRequired === true &&
    typeof (data as { challenge?: unknown }).challenge === 'string',
}));

vi.mock('../../../lib/auth-session', () => ({
  persistSession: persistSpy,
}));

vi.mock('../CryptographicMeshCanvas', () => ({
  CryptographicMeshCanvas: () => null,
  default: () => null,
}));

import LoginPage from '../LoginPage';

describe('LoginPage returnTo handling (QC-F-049)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = null;
    routerSpy.replace.mockClear();
    routerSpy.push.mockClear();
    persistSpy.mockClear();
    loginSpy.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.pushState({}, '', '/login');
  });

  async function renderAt(url: string) {
    window.history.pushState({}, '', url);
    await act(async () => {
      root.render(<LoginPage />);
    });
    // Flush the async SSO-capture effect (inert without token params).
    await act(async () => {});
  }

  function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('sends an already-authenticated visitor to the preserved destination, not /', async () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1' };
    await renderAt('/login?returnTo=%2Fchat%2Fconv-9');
    expect(routerSpy.replace).toHaveBeenCalledWith('/chat/conv-9');
    expect(routerSpy.replace).not.toHaveBeenCalledWith('/');
  });

  it('sends a password sign-in to the preserved destination', async () => {
    await renderAt('/login?returnTo=%2Fchat%2Fconv-9');
    const identifier = container.querySelector<HTMLInputElement>(
      '[data-testid="identifier-input"]',
    );
    const password = container.querySelector<HTMLInputElement>(
      '[data-testid="password-input"]',
    );
    expect(identifier).not.toBeNull();
    expect(password).not.toBeNull();
    setInputValue(identifier!, 'user@example.com');
    setInputValue(password!, 'secret123');
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {});
    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith('access-1', 'refresh-1');
    expect(routerSpy.replace).toHaveBeenCalledWith('/chat/conv-9');
  });

  it('falls back to / when there is no returnTo', async () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1' };
    await renderAt('/login');
    expect(routerSpy.replace).toHaveBeenCalledWith('/');
  });

  it('never navigates to an unsafe returnTo (open redirect)', async () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1' };
    await renderAt('/login?returnTo=%2F%2Fevil.example%2Fchat');
    expect(routerSpy.replace).toHaveBeenCalledWith('/');
    for (const call of routerSpy.replace.mock.calls) {
      expect(String(call[0])).not.toContain('evil.example');
    }
  });

  it('never navigates back to /login (redirect loop)', async () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1' };
    await renderAt('/login?returnTo=%2Flogin');
    expect(routerSpy.replace).toHaveBeenCalledWith('/');
  });
});
