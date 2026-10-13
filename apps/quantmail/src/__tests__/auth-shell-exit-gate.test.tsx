// @vitest-environment jsdom

// Auth-shell exit gate: a soft navigation out of the lean auth shell (e.g. the
// login form's router.push('/') after sign-in) must never mount an app page
// without its providers — it renders nothing and does one full document load.

import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPathname = '/login';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { AuthShellExitGate, authShellExit } from '../components/AuthShellExitGate';

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <AuthShellExitGate>
        <p data-testid="page">page</p>
      </AuthShellExitGate>,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AuthShellExitGate', () => {
  it.each(['/login', '/register', '/forgot-password', '/reset-password', '/login/'])(
    'passes %s through without reloading',
    (path) => {
      mockPathname = path;
      vi.useFakeTimers();
      const reload = vi.spyOn(authShellExit, 'reload').mockImplementation(() => {});
      const el = render();
      act(() => vi.runAllTimers());
      expect(el.querySelector('[data-testid="page"]')).not.toBeNull();
      expect(reload).not.toHaveBeenCalled();
    },
  );

  it.each(['/', '/calendar', '/sso', '/privacy'])(
    'leaving the auth shell for %s renders nothing and does one full load',
    (path) => {
      mockPathname = path;
      vi.useFakeTimers();
      const reload = vi.spyOn(authShellExit, 'reload').mockImplementation(() => {});
      const el = render();
      expect(el.querySelector('[data-testid="page"]')).toBeNull();
      expect(el.querySelector('[data-testid="auth-shell-exit"]')?.getAttribute('role')).toBe('status');
      act(() => vi.runAllTimers());
      expect(reload).toHaveBeenCalledTimes(1);
    },
  );
});
