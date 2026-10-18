// @vitest-environment jsdom
// ============================================================================
// QuantChat - AuthGateCore QC-F-502: a 5xx session error is shown honestly
// ============================================================================
//
// QC-F-502 (P0): when userinfo answers 5xx, the gate must NOT bounce the
// visitor to /login (that bounce, multiplied by the per-component useAuth
// instances, is the 'Redirecting to sign in...' loop) and must NOT render
// protected children on a fabricated session. It renders an honest
// server-error / retry state instead.
//
// Band contract (specialist-qc-f-502-buildprep.md §5.3 / §8):
//   NC-502-2  gated path + useAuth error 'userinfo failed: 500' ->
//             honest error state (server-error copy + Try again),
//             onRedirect called 0 times, children never render,
//             'Redirecting to sign in...' never appears.
//   PIN-502-2a gated path + no error + logged out -> the existing login
//             redirect is unchanged.
//   PIN-502-2b gated path + a NON-5xx error string -> login redirect is
//             unchanged (only the HTTP-5xx class is intercepted).
//   PIN-502-2c public path + 5xx error -> children render (gate steps
//             aside on public routes exactly as before).
//
// Mocks are module-level with STABLE identities: the auth state is a single
// hoisted object whose fields each test mutates (fresh-identity mocks can
// drive effect loops — proven incident, see auth-gate-core.test.tsx).
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
  login: async () => {},
  logout: async () => {},
  register: async () => {},
  refreshToken: async () => {},
}));

vi.mock('@quant/shared-ui', () => ({
  useAuth: () => authState,
  LoadingState: ({ text }: { text?: string }) => <div data-loading-state>{text}</div>,
}));

vi.mock('../../lib/auth-session', () => ({
  bootstrapSession: vi.fn(() => false),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
}));

import { AuthGateCore } from '../auth-gate';

describe('AuthGateCore QC-F-502 — 5xx honesty', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onRedirect: ReturnType<typeof vi.fn<(path: string) => void>>;

  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = null;
    authState.error = null;
    onRedirect = vi.fn<(path: string) => void>();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderGate(pathname: string) {
    act(() => {
      root.render(
        <AuthGateCore pathname={pathname} onRedirect={onRedirect}>
          <div>protected content</div>
        </AuthGateCore>,
      );
    });
  }

  it('NC-502-2: a 5xx userinfo error shows an honest server-error state — no redirect, no children, no Redirecting loop', () => {
    authState.error = 'userinfo failed: 500';
    renderGate('/settings');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('protected content');
    expect(container.textContent).not.toContain('Redirecting to sign in...');
    expect(container.textContent).toContain('Something went wrong on our side');
    expect(container.textContent).toContain('Try again');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('NC-502-2b: a 503 userinfo error is intercepted the same way', () => {
    authState.error = 'userinfo failed: 503';
    renderGate('/');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('protected content');
    expect(container.textContent).toContain('Something went wrong on our side');
  });

  it('PIN-502-2a: logged out with NO error still redirects to /login (unchanged)', () => {
    renderGate('/settings');
    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(onRedirect).toHaveBeenCalledWith('/login?returnTo=%2Fsettings');
    expect(container.textContent).not.toContain('protected content');
  });

  it('PIN-502-2b: a non-5xx error string does NOT intercept the login redirect', () => {
    authState.error = 'userinfo failed: 400';
    renderGate('/settings');
    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Something went wrong on our side');
  });

  it('PIN-502-2c: a public path renders children even with a 5xx error (gate steps aside)', () => {
    authState.error = 'userinfo failed: 500';
    renderGate('/login');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });

  it('PIN-502-2d: an authenticated visitor renders children even if an error string lingers', () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1' };
    authState.error = 'userinfo failed: 500';
    renderGate('/discover');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });
});
