// @vitest-environment jsdom
//
// QC-F-141 — LoginPage second-factor step (web client, §7 cases 15-18).
//
// The backend now answers password login with EITHER a session OR a 2FA
// challenge. These tests pin the page's half of that contract with a mocked
// apiClient singleton (the guard logic itself is unit-tested against the real
// api-client module in api-client-two-factor.test.ts):
//   15. challenge answer -> code step appears, persistSession NOT called,
//       no navigation.
//   16. code verify success -> persistSession + redirect, same as plain login.
//   17. INVALID_CODE -> stay on the code step, field cleared, no session.
//   18. CHALLENGE_EXPIRED -> back to the password step with an info message.
//   +  TWO_FACTOR_STATE_INVALID on the password step shows the recovery copy.
//
// The challenge lives only in component state: there is deliberately no
// localStorage/sessionStorage assertion target — nothing is written there.
// ============================================================================

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  loginWithPassword: vi.fn(),
  verifyTwoFactorLogin: vi.fn(),
  persistSession: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mocks.routerReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

vi.mock('@quant/shared-ui', () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
  UniversalSSOTokenBridge: {
    getInstance: () => ({ decodeUnverifiedHandoffTicket: () => null }),
    validateSafeReturnPath: (u: string) => ({ isSafe: false, sanitizedUrl: u }),
  },
}));

vi.mock('../../../services/api-client', () => ({
  apiClient: {
    loginWithPassword: mocks.loginWithPassword,
    verifyTwoFactorLogin: mocks.verifyTwoFactorLogin,
  },
  // The real guard's contract, re-stated for the mock: shape, not strings.
  isTwoFactorChallenge: (data: unknown): boolean =>
    typeof data === 'object' &&
    data !== null &&
    (data as { twoFactorRequired?: unknown }).twoFactorRequired === true &&
    typeof (data as { challenge?: unknown }).challenge === 'string',
}));

vi.mock('../../../lib/auth-session', () => ({
  persistSession: mocks.persistSession,
}));

vi.mock('../../../components/auth/CryptographicMeshCanvas', () => ({
  CryptographicMeshCanvas: () => null,
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import LoginPage from '../../../components/auth/LoginPage';

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

async function setInputValue(input: HTMLInputElement, value: string) {
  // React 19 tracks the native value setter: a plain `input.value = x`
  // assignment never fires onChange, so state would stay empty.
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
    .set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('QC-F-141 LoginPage second-factor step', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<LoginPage />);
    });
    // Reveal the inline password fallback.
    const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('or sign in with email'),
    );
    expect(toggle).toBeTruthy();
    await act(async () => {
      toggle!.click();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function submitPassword() {
    const identifier = byTestId(container, 'identifier-input') as HTMLInputElement;
    const password = byTestId(container, 'password-input') as HTMLInputElement;
    await setInputValue(identifier, 'twofa@example.com');
    await setInputValue(password, 'correct-password');
    const submit = byTestId(container, 'submit-password-btn') as HTMLButtonElement;
    await act(async () => {
      submit.click();
    });
  }

  it('15. challenge answer shows the code step — no session, no navigation', async () => {
    mocks.loginWithPassword.mockResolvedValueOnce({
      success: true,
      data: { twoFactorRequired: true, challenge: 'ch_test_123', expiresIn: 300 },
    });

    await submitPassword();

    expect(byTestId(container, 'two-factor-form')).toBeTruthy();
    expect(byTestId(container, 'two-factor-code-input')).toBeTruthy();
    expect(mocks.persistSession).not.toHaveBeenCalled();
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    // The honest label names both code kinds (TOTP 6-digit OR recovery code).
    expect(container.textContent).toContain('authenticator app');
    expect(container.textContent).toContain('recovery codes');
  });

  it('16. successful code verify persists the session and redirects', async () => {
    mocks.loginWithPassword.mockResolvedValueOnce({
      success: true,
      data: { twoFactorRequired: true, challenge: 'ch_test_123', expiresIn: 300 },
    });
    mocks.verifyTwoFactorLogin.mockResolvedValueOnce({
      success: true,
      data: {
        accessToken: 'verified-access',
        refreshToken: 'verified-refresh',
        expiresIn: 3600,
        tokenType: 'Bearer',
        user: { id: 'u1', email: 'twofa@example.com', username: 'twofa_user' },
      },
    });

    await submitPassword();

    const codeInput = byTestId(container, 'two-factor-code-input') as HTMLInputElement;
    await setInputValue(codeInput, '123456');
    expect(mocks.verifyTwoFactorLogin).not.toHaveBeenCalled();
    const verifyBtn = byTestId(container, 'verify-two-factor-btn') as HTMLButtonElement;
    await act(async () => {
      verifyBtn.click();
    });

    expect(mocks.verifyTwoFactorLogin).toHaveBeenCalledTimes(1);
    expect(mocks.verifyTwoFactorLogin).toHaveBeenCalledWith({
      challenge: 'ch_test_123',
      code: '123456',
    });
    expect(mocks.persistSession).toHaveBeenCalledWith('verified-access', 'verified-refresh');
    expect(mocks.routerReplace).toHaveBeenCalledWith('/');
  });

  it('17. INVALID_CODE stays on the code step with the field cleared', async () => {
    mocks.loginWithPassword.mockResolvedValueOnce({
      success: true,
      data: { twoFactorRequired: true, challenge: 'ch_test_123', expiresIn: 300 },
    });
    mocks.verifyTwoFactorLogin.mockResolvedValueOnce({
      success: false,
      error: { code: 'INVALID_CODE', message: 'Invalid code. Try again.', statusCode: 401 },
    });

    await submitPassword();

    const codeInput = byTestId(container, 'two-factor-code-input') as HTMLInputElement;
    await setInputValue(codeInput, '000000');
    const verifyBtn = byTestId(container, 'verify-two-factor-btn') as HTMLButtonElement;
    await act(async () => {
      verifyBtn.click();
    });

    // Still on the code step, nothing persisted.
    expect(byTestId(container, 'two-factor-form')).toBeTruthy();
    expect(mocks.persistSession).not.toHaveBeenCalled();
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Invalid code');
  });

  it('18. CHALLENGE_EXPIRED returns to the password step with an info message', async () => {
    mocks.loginWithPassword.mockResolvedValueOnce({
      success: true,
      data: { twoFactorRequired: true, challenge: 'ch_test_123', expiresIn: 300 },
    });
    mocks.verifyTwoFactorLogin.mockResolvedValueOnce({
      success: false,
      error: {
        code: 'CHALLENGE_EXPIRED',
        message: 'This sign-in attempt is no longer valid.',
        statusCode: 401,
      },
    });

    await submitPassword();
    expect(byTestId(container, 'two-factor-form')).toBeTruthy();

    const codeInput = byTestId(container, 'two-factor-code-input') as HTMLInputElement;
    await setInputValue(codeInput, '123456');
    const verifyBtn = byTestId(container, 'verify-two-factor-btn') as HTMLButtonElement;
    await act(async () => {
      verifyBtn.click();
    });

    // Back on the password step; the dead challenge is gone.
    expect(byTestId(container, 'two-factor-form')).toBeNull();
    expect(byTestId(container, 'identifier-input')).toBeTruthy();
    expect(container.textContent).toContain('enter your password again');
    expect(mocks.persistSession).not.toHaveBeenCalled();
  });

  it('TWO_FACTOR_STATE_INVALID shows the honest recovery copy on the password step', async () => {
    mocks.loginWithPassword.mockResolvedValueOnce({
      success: false,
      error: {
        code: 'TWO_FACTOR_STATE_INVALID',
        message: 'This account security state needs recovery before sign-in.',
        statusCode: 409,
      },
    });

    await submitPassword();

    expect(byTestId(container, 'two-factor-form')).toBeNull();
    expect(container.textContent).toContain('security recovery');
    expect(mocks.persistSession).not.toHaveBeenCalled();
  });

  it('2FA-off login behaviour is unchanged (session persisted, redirected)', async () => {
    mocks.loginWithPassword.mockResolvedValueOnce({
      success: true,
      data: {
        accessToken: 'plain-access',
        refreshToken: 'plain-refresh',
        expiresIn: 3600,
        tokenType: 'Bearer',
        user: { id: 'u2', email: 'plain@example.com', username: 'plain_user' },
      },
    });

    await submitPassword();

    // No code step for 2FA-off accounts — the page behaves exactly as before.
    expect(byTestId(container, 'two-factor-form')).toBeNull();
    expect(mocks.persistSession).toHaveBeenCalledWith('plain-access', 'plain-refresh');
    expect(mocks.routerReplace).toHaveBeenCalledWith('/');
  });
});
