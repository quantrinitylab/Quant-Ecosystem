// @vitest-environment jsdom
// ============================================================================
// Drawer-close-on-navigation (mobile-inbox P2, 2026-10-24).
//
// The mobile drawer is modal (backdrop, locked scroll, focus trap). Its
// capture gate used to close only for clicks landing on `.sidebar-nav-item`
// / `.sidebar-compose`, so the brand header (router.push('/')) and the
// footer links (/privacy, /settings) navigated while the drawer stayed on
// screen over the new page. The fix is two-layered:
//
//   1. A pathname-change effect in AppShell closes the drawer on ANY route
//      change — present and future in-drawer links included.
//   2. The capture gate also matches `.sidebar-brand` and any `a[href]`, so
//      same-pathname taps (brand while already on '/', a footer link to the
//      current route) close the drawer too.
//
// Non-navigating drawer controls (a plain button, a text input) must NOT
// close it — the user is still working inside the drawer.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Navigation state for the test run. Local runs use a temp vitest config
// (/tmp/qm-vitest.config.ts) aliasing next/* to stubs, because this VM's
// pnpm store copy of `next` is missing its package.json and cannot resolve
// next/dynamic or next/navigation at all (pre-existing environment defect —
// the sibling inbox-view-nav-targets test fails the same way here; CI
// installs next fresh, so no repo change is needed for it).
const navState = {
  pathname: '/privacy',
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
};
(globalThis as any).__qmNavState = navState;

vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({ data: [] }),
}));

vi.mock('../hooks/useNewMailDesktopAlerts', () => ({
  useNewMailDesktopAlerts: () => {},
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@quant/shared-ui', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFocusTrap: () => ({ current: null }),
}));

vi.mock('../components/DesktopContextSidebar', () => ({
  DesktopContextSidebar: () => null,
}));

vi.mock('../components/DesktopAppRail', () => ({
  DesktopAppRail: () => null,
}));

vi.mock('../components/QuantPillarTopBar', () => ({
  QuantPillarTopBar: () => null,
}));

vi.mock('../components/ContextBottomNavBar', () => ({
  ContextBottomNavBar: () => null,
}));

vi.mock('../components/QuantFab', () => ({
  QuantFab: () => null,
}));

vi.mock('../components/QuantyLauncher', () => ({
  QuantyDrawerHost: () => null,
}));

vi.mock('../components/workplace/QuantyAvatarPicker', () => ({
  QuantyAvatarPicker: () => null,
}));

vi.mock('../components/QuantumSplashIntro', () => ({
  QuantumSplashIntro: () => null,
}));

vi.mock('../components/AuxSurfaceBoundary', () => ({
  AuxSurfaceBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/UndoSendCountdownBar', () => ({
  UndoSendProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/ShellChromeContext', () => ({
  ShellChromeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/SearchClearButton', () => ({
  SearchClearButton: () => null,
}));

import { AppShell } from '../components/AppShell';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function FakeDrawerSidebar() {
  return (
    <div>
      <div className="sidebar-brand" data-testid="drawer-brand">
        <span>QuantMail brand</span>
      </div>
      <button type="button" className="sidebar-nav-item" data-testid="drawer-nav-item">
        Inbox
      </button>
      <a href="/privacy" data-testid="drawer-footer-link">
        Privacy &amp; Data Safety
      </a>
      <button type="button" data-testid="drawer-plain-button">
        Plain drawer control
      </button>
      <input type="text" data-testid="drawer-input" defaultValue="" />
    </div>
  );
}

function renderShell() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppShell sidebar={<FakeDrawerSidebar />}>
        <div>Page content</div>
      </AppShell>,
    );
  });
}

function drawerAside(): HTMLElement {
  const aside = container!.querySelector('aside[role="dialog"]');
  expect(aside).not.toBeNull();
  return aside as HTMLElement;
}

function openDrawer() {
  const menuButton = container!.querySelector('[data-testid="shell-mobile-menu-button"]');
  expect(menuButton).not.toBeNull();
  act(() => {
    menuButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(drawerAside().className).toContain('translate-x-0');
  expect(drawerAside().className).not.toContain('-translate-x-full');
}

function clickTestId(testId: string) {
  const el = container!.querySelector(`[data-testid="${testId}"]`);
  expect(el).not.toBeNull();
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function expectDrawerClosed() {
  expect(drawerAside().className).toContain('-translate-x-full');
}

function expectDrawerOpen() {
  expect(drawerAside().className).toContain('translate-x-0');
  expect(drawerAside().className).not.toContain('-translate-x-full');
}

beforeEach(() => {
  navState.pathname = '/privacy';
  vi.clearAllMocks();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('AppShell mobile drawer closes on in-drawer navigation', () => {
  it('closes when the brand header is tapped', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-brand');
    expectDrawerClosed();
  });

  it('closes when a footer anchor link is tapped', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-footer-link');
    expectDrawerClosed();
  });

  it('keeps closing on nav-item taps (pre-existing behavior)', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-nav-item');
    expectDrawerClosed();
  });

  it('closes on ANY route change, even without a drawer click', () => {
    renderShell();
    openDrawer();
    navState.pathname = '/settings';
    act(() => {
      root!.render(
        <AppShell sidebar={<FakeDrawerSidebar />}>
          <div>Page content</div>
        </AppShell>,
      );
    });
    expectDrawerClosed();
  });

  it('stays open when a non-navigating drawer control is tapped', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-plain-button');
    expectDrawerOpen();
    clickTestId('drawer-input');
    expectDrawerOpen();
  });
});
