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

// The mobile navigation drawer (and its hamburger) was removed. What stays is
// the dead-end fix that sat next to it: secondary routes that mount a sidebar
// but have no bottom bar and no back link of their own get a slim mobile
// header with a back chevron — the only escape in an installed PWA.
describe('AppShell — mobile back chevron on secondary routes (no drawer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
    mockCurrentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders only the back chevron on /labels (no hamburger, no drawer)', () => {
    mockCurrentPathname = '/labels';
    const html = renderToStaticMarkup(
      <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
        <div>Labels Content</div>
      </AppShell>,
    );

    expect(html).toContain('data-testid="shell-mobile-back-button"');
    expect(html).toContain('aria-label="Go back"');
    expect(html).toContain('min-h-[44px]');
    // No hamburger and no modal navigation drawer.
    expect(html).not.toContain('shell-mobile-menu-button');
    expect(html).not.toContain('Open navigation menu');
    expect(html).not.toContain('Close navigation menu');
    expect(html).not.toContain('aria-label="Navigation"');
    // The sidebar prop is no longer rendered into a mobile overlay.
    expect(html).not.toContain('sidebar-test');
    // Not the full 5-pillar switcher on a secondary route
    expect(html).not.toContain('Super-App 5-Pillar Navigation Bar');
  });

  it('renders the back chevron on /sent (mail-folder route keeps bottom nav too)', () => {
    mockCurrentPathname = '/sent';
    const html = renderToStaticMarkup(
      <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
        <div>Sent Content</div>
      </AppShell>,
    );

    expect(html).toContain('data-testid="shell-mobile-back-button"');
    expect(html).not.toContain('shell-mobile-menu-button');
    // Mail-folder routes keep the contextual bottom bar (existing behavior)
    expect(html).toContain('contextual navigation');
  });

  it('renders the back chevron on /settings, /search, /notifications and /admin', () => {
    for (const route of ['/settings', '/search', '/notifications', '/admin']) {
      mockCurrentPathname = route;
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Content</div>
        </AppShell>,
      );
      expect(html).toContain('data-testid="shell-mobile-back-button"');
      expect(html).not.toContain('shell-mobile-menu-button');
    }
  });

  it('does NOT render the secondary header on main suite routes, and no hamburger anywhere', () => {
    for (const route of ['/', '/calendar', '/drive', '/contacts', '/quantgit']) {
      mockCurrentPathname = route;
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Content</div>
        </AppShell>,
      );
      expect(html).not.toContain('shell-mobile-menu-button');
      expect(html).not.toContain('shell-mobile-back-button');
      // The pillar bar no longer has a hamburger either.
      expect(html).not.toContain('pillar-menu-button');
      expect(html).not.toContain('Open navigation menu');
    }
  });

  it('does NOT render the secondary header when no sidebar is mounted', () => {
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
