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
//
// Runs under the repo's REAL vitest config (apps/quantmail/vitest.config.ts)
// with the repo's established next/navigation mock pattern (mutable
// pathname + router fns, as in app-shell-integration.test.tsx and
// mobile-drawer-deadend.test.tsx) — no bespoke harness, no next/* stubs.
// The sidebar prop is a fake mirroring the real AppSidebar's DOM shapes:
// `.sidebar-brand` div with an onClick router.push('/'), and plain anchors
// for the footer links (what next/link renders), plus a `.sidebar-nav-item`.
// AppShell itself is real.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mutable navigation state, following the repo's established pattern
// (mobile-drawer-deadend.test.tsx): the mock returns the CURRENT pathname,
// so re-rendering after mutating it models a committed route change —
// whether it came from a tap, a keyboard shortcut, or browser back/forward.
let currentPathname = '/privacy';
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockPrefetch = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: mockPrefetch,
    back: mockBack,
  }),
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams(),
}));

// Established pattern (qm-uiux-093): dynamic imports resolve to a null
// component, so the lazily-loaded Quanty live agent stays out of the test.
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

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

// Mirrors the real AppSidebar (AppSidebar.tsx): the brand header is a
// `.sidebar-brand` div whose inner div calls router.push('/'), and the
// footer links are anchors to /privacy and /settings (what next/link
// renders). The drawer-close logic under test lives entirely in AppShell.
function FakeDrawerSidebar() {
  return (
    <div>
      <div className="sidebar-brand" data-testid="drawer-brand">
        <div onClick={() => mockPush('/')} data-testid="drawer-brand-inner">
          <span>QuantMail brand</span>
        </div>
      </div>
      <button type="button" className="sidebar-nav-item" data-testid="drawer-nav-item">
        Inbox
      </button>
      <a href="/privacy" data-testid="drawer-footer-privacy">
        Privacy &amp; Data Safety
      </a>
      <a href="/settings" data-testid="drawer-footer-settings">
        Settings
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

// Re-render with a new pathname: models a committed route change, whatever
// caused it. No drawer click, no router call from the test itself unless the
// individual test performs one.
function navigateTo(path: string) {
  currentPathname = path;
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

function backdropButton(): HTMLElement {
  const button = container!.querySelector('button[aria-label="Close navigation menu"]');
  expect(button).not.toBeNull();
  return button as HTMLElement;
}

function menuButton(): HTMLElement {
  const button = container!.querySelector('[data-testid="shell-mobile-menu-button"]');
  expect(button).not.toBeNull();
  return button as HTMLElement;
}

function openDrawer() {
  act(() => {
    menuButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expectDrawerOpen();
}

// On main suite routes (e.g. '/') the hamburger lives in the mocked-out
// QuantPillarTopBar, so open the drawer the way that bar and the `[`
// shortcut do: the `quant:sidebar:toggle` window event.
function openDrawerViaToggleEvent() {
  act(() => {
    window.dispatchEvent(new CustomEvent('quant:sidebar:toggle'));
  });
  expectDrawerOpen();
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
  currentPathname = '/privacy';
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
  document.body.style.overflow = '';
});

describe('AppShell mobile drawer closes on in-drawer navigation', () => {
  it('closes when the brand header is tapped (logo -> /)', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-brand-inner');
    expectDrawerClosed();
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('closes when the footer Privacy link is tapped', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-footer-privacy');
    expectDrawerClosed();
  });

  it('closes when the footer Settings link is tapped', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-footer-settings');
    expectDrawerClosed();
  });

  it('keeps closing on nav-item taps (pre-existing behavior)', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-nav-item');
    expectDrawerClosed();
  });

  it('closes on keyboard Enter activation of a focused footer link', () => {
    // jsdom does not synthesize a click from a keydown, so this dispatches
    // the click the browser itself fires when Enter activates a focused
    // link. The gate sees a click either way — keyboard activation is not
    // a separate code path, and this pins that it is not excluded from it.
    renderShell();
    openDrawer();
    const link = container!.querySelector('[data-testid="drawer-footer-settings"]') as HTMLElement;
    act(() => {
      link.focus();
    });
    expect(document.activeElement).toBe(link);
    act(() => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expectDrawerClosed();
  });

  it('closes on keyboard-shortcut navigation: a route change with no drawer click', () => {
    // Models a keybinding that calls router.push (e.g. a palette action):
    // the drawer sees no click at all, only the pathname change.
    renderShell();
    openDrawer();
    navigateTo('/settings');
    expectDrawerClosed();
  });

  it('closes on browser back/forward: a pathname change with no click and no push', () => {
    // History navigation changes the pathname without any in-drawer
    // interaction and without a router.push call from the drawer.
    renderShell();
    openDrawer();
    navigateTo('/calendar');
    expectDrawerClosed();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('closes on a pathname change that is NOT a drawer-link navigation', () => {
    // The pillar switcher (outside the drawer) navigates while the drawer
    // is open: the effect is route-driven, not click-driven, so it closes.
    renderShell();
    openDrawer();
    navigateTo('/drive');
    expectDrawerClosed();
  });

  it('closes on a same-pathname brand tap via the capture gate (no route change)', () => {
    // Brand while already on '/': the pathname effect cannot fire because
    // the pathname does not change, so only the widened capture gate
    // (`.sidebar-brand`) closes the drawer.
    currentPathname = '/';
    renderShell();
    openDrawerViaToggleEvent();
    clickTestId('drawer-brand-inner');
    expectDrawerClosed();
  });

  it('does NOT restore focus to the menu trigger after a route-driven close', () => {
    // A route change owns focus; the trigger belongs to the old page.
    // The pathname effect calls setIsSidebarOpen(false) directly, never
    // closeSidebar(), so no focus return happens.
    renderShell();
    openDrawer();
    const navItem = container!.querySelector(
      '[data-testid="drawer-nav-item"]',
    ) as HTMLElement;
    act(() => {
      navItem.focus();
    });
    expect(document.activeElement).toBe(navItem);
    navigateTo('/settings');
    expectDrawerClosed();
    expect(document.activeElement).not.toBe(menuButton());
  });

  it('releases the scroll lock and backdrop on route-driven close', () => {
    renderShell();
    openDrawer();
    expect(document.body.style.overflow).toBe('hidden');
    expect(backdropButton().className).toContain('opacity-100');
    navigateTo('/settings');
    expectDrawerClosed();
    expect(document.body.style.overflow).toBe('');
    expect(backdropButton().className).toContain('invisible');
    expect(backdropButton().className).toContain('pointer-events-none');
  });

  it('stays open when a non-navigating drawer control is tapped', () => {
    renderShell();
    openDrawer();
    clickTestId('drawer-plain-button');
    expectDrawerOpen();
    clickTestId('drawer-input');
    expectDrawerOpen();
    // Still modal: the lock the widened gate must not have dropped.
    expect(document.body.style.overflow).toBe('hidden');
  });
});
