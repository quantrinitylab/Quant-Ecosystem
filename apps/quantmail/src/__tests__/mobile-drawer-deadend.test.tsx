import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell';

// Desktop redesign (2026-10-10): AppShell's pinned rail renders the real
// DesktopContextSidebar — hermetic marker here, the component itself is
// covered in desktop-context-sidebar.test.tsx.
vi.mock('../components/DesktopContextSidebar', () => ({
  DesktopContextSidebar: () => <div data-testid="desktop-context-sidebar-mock" />,
}));

// Mock Window EventTarget
class MockWindow {
  listeners: Record<string, Function[]> = {};

  addEventListener(type: string, callback: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
  }

  removeEventListener(type: string, callback: Function) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((cb) => cb !== callback);
    }
  }

  dispatchEvent(event: any) {
    const list = this.listeners[event.type] || [];
    for (const cb of list) {
      cb(event);
    }
    return true;
  }
}

const mockWindow = new MockWindow() as any;
(globalThis as any).window = mockWindow;

// Mock Next.js navigation hooks
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockPrefetch = vi.fn();
const mockBack = vi.fn();
let mockCurrentPathname = '/';
let mockCurrentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: mockPrefetch,
    back: mockBack,
  }),
  usePathname: () => mockCurrentPathname,
  useSearchParams: () => mockCurrentSearchParams,
}));

// Mock useInbox to avoid react-query requirements in static render
vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({
    data: [
      { id: '1', isRead: false },
      { id: '2', isRead: true },
      { id: '3', isRead: false },
    ],
    refetch: vi.fn(),
  }),
}));

// Mock the desktop-alert watcher (QM-SCREEN-015) for the same reason: it polls
// via react-query, which has no provider in a static render.
vi.mock('../hooks/useNewMailDesktopAlerts', () => ({
  useNewMailDesktopAlerts: () => {},
}));

// Mock shared UI components
vi.mock('@quant/shared-ui', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => (
    <div className="page-transition">{children}</div>
  ),
  useFocusTrap: () => ({ current: null }),
  BubbleAvatar: () => <div className="bubble-avatar" />,
}));

describe('AppShell — mobile drawer dead-end fix (secondary routes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
    mockCurrentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the drawer opener + back button on /labels (non-pillar drawer route)', () => {
    mockCurrentPathname = '/labels';
    const html = renderToStaticMarkup(
      <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
        <div>Labels Content</div>
      </AppShell>,
    );

    // Slim secondary header: drawer opener and back affordance
    expect(html).toContain('data-testid="shell-mobile-menu-button"');
    expect(html).toContain('aria-label="Open navigation menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-testid="shell-mobile-back-button"');
    expect(html).toContain('aria-label="Go back"');
    // Not the full 5-pillar switcher on a secondary route
    expect(html).not.toContain('Super-App 5-Pillar Navigation Bar');
    // The drawer itself is still mounted in the DOM
    expect(html).toContain('sidebar-test');
  });

  it('renders the drawer opener on /sent (mail-folder route keeps bottom nav too)', () => {
    mockCurrentPathname = '/sent';
    const html = renderToStaticMarkup(
      <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
        <div>Sent Content</div>
      </AppShell>,
    );

    expect(html).toContain('data-testid="shell-mobile-menu-button"');
    expect(html).toContain('data-testid="shell-mobile-back-button"');
    // Mail-folder routes keep the contextual bottom bar (existing behavior)
    expect(html).toContain('contextual navigation');
  });

  it('renders the drawer opener on /settings and /search', () => {
    for (const route of ['/settings', '/search', '/notifications', '/admin']) {
      mockCurrentPathname = route;
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Content</div>
        </AppShell>,
      );
      expect(html).toContain('data-testid="shell-mobile-menu-button"');
      expect(html).toContain('data-testid="shell-mobile-back-button"');
    }
  });

  it('does NOT render the secondary header on main suite routes (pillar bar owns the hamburger there)', () => {
    for (const route of ['/', '/calendar', '/drive', '/contacts', '/quantgit']) {
      mockCurrentPathname = route;
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Content</div>
        </AppShell>,
      );
      expect(html).not.toContain('shell-mobile-menu-button');
      expect(html).not.toContain('shell-mobile-back-button');
      // The pillar bar's own hamburger is the drawer opener on suite routes
      expect(html).toContain('data-testid="pillar-menu-button"');
    }
  });

  it('does NOT render the secondary header when no sidebar is mounted (no drawer in DOM)', () => {
    mockCurrentPathname = '/labels';
    const html = renderToStaticMarkup(
      <AppShell>
        <div>Labels Content</div>
      </AppShell>,
    );

    expect(html).not.toContain('shell-mobile-menu-button');
    expect(html).not.toContain('shell-mobile-back-button');
  });

  it('does NOT render the secondary header when the route supplies its own topBar', () => {
    mockCurrentPathname = '/labels';
    const html = renderToStaticMarkup(
      <AppShell
        sidebar={<div id="sidebar-test">Sidebar</div>}
        topBar={<div data-testid="custom-top-bar">Custom</div>}
      >
        <div>Labels Content</div>
      </AppShell>,
    );

    expect(html).toContain('data-testid="custom-top-bar"');
    expect(html).not.toContain('shell-mobile-menu-button');
    expect(html).not.toContain('shell-mobile-back-button');
  });
});
