// @vitest-environment jsdom
// ============================================================================
// QuantChat - AuthGate (App Router adapter) first-redirect behavior
//
// Regression contract for the PR #961 review of QC-F-049: the adapter
// used to start with suffix=null and populate it in a parent useEffect,
// while AuthGateCore's redirect effect is a CHILD effect — and React
// runs child effects first. On an initially settled logged-out session
// the core therefore redirected with a null suffix ('/login?returnTo=
// %2Fmeet%2Froom-9'), and once the router landed on /login (public) no
// second redirect ever added the query/hash: the deep link died.
//
// The core tests cannot catch this — they inject a pre-supplied suffix
// into AuthGateCore directly. These tests mount the REAL AuthGate
// adapter with the auth state ALREADY settled (isLoading=false,
// isAuthenticated=false on the very first render) and assert that the
// FIRST and ONLY router.replace carries the full destination.
//
// Mocks are module-level and return STABLE identities (hoisted state
// objects mutated per test) — a mock handing back fresh identities per
// render can drive effect loops.
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

const navState = vi.hoisted(() => ({ pathname: '/' as string }));

const routerReplace = vi.hoisted(
  () => vi.fn<(path: string) => void>(),
);
const stableRouter = vi.hoisted(() => ({
  replace: routerReplace,
  push: vi.fn<(path: string) => void>(),
  prefetch: vi.fn<(path: string) => void>(),
  back: vi.fn<() => void>(),
  forward: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
}));

vi.mock('@quant/shared-ui', () => ({
  useAuth: () => authState,
  LoadingState: ({ text }: { text?: string }) => <div data-loading-state>{text}</div>,
}));

vi.mock('../../lib/auth-session', () => ({
  bootstrapSession: vi.fn(() => false),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
  usePathname: () => navState.pathname,
}));

import { AuthGate } from '../auth-gate';

describe('AuthGate (real App Router adapter)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // Initially SETTLED logged-out session — the exact precondition of
    // the race the review found.
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = null;
    routerReplace.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.pushState({}, '', '/');
  });

  function renderAdapter(pathname: string, url: string) {
    navState.pathname = pathname;
    window.history.pushState({}, '', url);
    act(() => {
      root.render(
        <AuthGate>
          <div>protected content</div>
        </AuthGate>,
      );
    });
  }

  it('first and only redirect preserves path + query + hash of a deep link', () => {
    renderAdapter('/meet/room-9', '/meet/room-9?code=4821#join');
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith(
      '/login?returnTo=%2Fmeet%2Froom-9%3Fcode%3D4821%23join',
    );
    expect(container.textContent).not.toContain('protected content');
  });

  it('public root with a suffix renders children (no redirect) — suffix round-trip is covered by return-to tests', () => {
    renderAdapter('/', '/?view=inbox&lens=snoozed');
    expect(routerReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });

  it('bare public root renders children (no redirect to /login)', () => {
    renderAdapter('/', '/');
    expect(routerReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });

  it('renders children and never redirects for an authenticated visitor', () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1' };
    renderAdapter('/meet/room-9', '/meet/room-9?code=4821#join');
    expect(routerReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected content');
  });
});
