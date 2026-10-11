// @vitest-environment jsdom
// ============================================================================
// QuantChat - AuthGateCore behavior (the shared gate both routers mount)
//
// Regression contract for the 2026-10-11 P0: Pages Router routes shipped
// ungated because only the App Router layout mounted a gate. The decision
// logic now lives in AuthGateCore; these tests pin its behavior for every
// classification the route registry can return:
//
//   app route + logged out  -> redirect to /login, children never render
//   app route + logged in   -> children render, no redirect
//   app route + resolving   -> session spinner, no redirect yet
//   public route            -> children render regardless of session
//   unknown route           -> children render (the 404), NO login bounce
//
// Mocks are module-level and return STABLE identities (the auth state is a
// single hoisted object whose fields each test mutates) — a mock handing
// back fresh object/function identities per render can drive effect loops.
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

describe('AuthGateCore', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onRedirect: ReturnType<typeof vi.fn<(path: string) => void>>;

  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = null;
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

  it('redirects a logged-out visitor on an app route to /login and never renders children', () => {
    renderGate('/settings');
    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(onRedirect).toHaveBeenCalledWith('/login');
    expect(container.textContent).not.toContain('protected content');
  });

  it('redirects a logged-out visitor on a Pages Router route too (the P0 routes)', () => {
    renderGate('/calls');
    expect(onRedirect).toHaveBeenCalledWith('/login');
    expect(container.textContent).not.toContain('protected content');
  });

  it('renders children for an authenticated visitor on an app route', () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1' };
    renderGate('/discover');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });

  it('shows the session spinner while identity resolves and does not redirect yet', () => {
    authState.isLoading = true;
    renderGate('/');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Verifying your session...');
    expect(container.textContent).not.toContain('protected content');
  });

  it('lets public routes render logged-out (no redirect)', () => {
    renderGate('/login');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });

  it('lets the password-recovery handoff render logged-out', () => {
    renderGate('/forgot-password');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });

  it('lets unknown paths render (the 404) instead of bouncing them to /login', () => {
    renderGate('/this-route-does-not-exist');
    expect(onRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });
});
