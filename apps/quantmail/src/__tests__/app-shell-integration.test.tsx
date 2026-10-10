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
let mockCurrentPathname = '/';
let mockCurrentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: mockPrefetch,
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

// Mock shared UI components
vi.mock('@quant/shared-ui', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <div className="page-transition">{children}</div>,
  useFocusTrap: () => ({ current: null }),
  BubbleAvatar: () => <div className="bubble-avatar" />,
}));

describe('AppShell — Super-App 5-Pillar Top Bar & Contextual Bottom Nav Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
    mockCurrentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Suite Route Pillar TopBar & Contextual Bottom Nav
  //
  // Gmail rule: ONE nav system per viewport. Mobile gets exactly one bottom
  // bar — the contextual per-app tab bar (aria-label "<Pillar> contextual
  // navigation"). The top holds exactly ONE 5-app switcher
  // (QuantPillarTopBar); the old bottom duplicate (MobilePillarBottomNav,
  // aria-label "App pillars") and the top sub-tab strip (MobileSubTabStrip)
  // were both removed per user decision (reverses #531).
  // ==========================================================================
  describe('Mounting on Main Suite Routes', () => {
    it('mounts QuantPillarTopBar and the contextual bottom nav on Mail suite route (/)', () => {
      mockCurrentPathname = '/';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Mail Content</div>
        </AppShell>,
      );

      // QuantPillarTopBar is present
      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).not.toContain('Quant AI:');
      expect(html).toContain('Mail');
      expect(html).toContain('Calendar');
      expect(html).toContain('Drive');
      expect(html).toContain('Contacts');
      expect(html).toContain('QuantGit');

      // Exactly ONE bottom bar: the contextual per-app tab bar
      expect(html).toContain('Mail contextual navigation');
      // The removed bottom app-switcher duplicate is gone
      expect(html).not.toContain('App pillars');
      // The removed top sub-tab strip is gone
      expect(html).not.toContain('sub-navigation');
      // In-flow bottom nav (this PR's black-void fix): the contextual bar is
      // an in-flow flex child whose height collapses to 0 on scroll, so
      // <main> must NOT reserve padding — the old fixed-bar pb-16 is gone.
      expect(html).not.toContain('pb-16');
      // The safe-area-aware chrome lives on the bar itself
      expect(html).toContain('pb-[env(safe-area-inset-bottom,0px)]');
    });

    it('mounts the contextual bottom nav on Calendar route (/calendar)', () => {
      mockCurrentPathname = '/calendar';
      // The mobile bottom nav owns its own tab set (ContextBottomNavBar's
      // PILLAR_SUB_CONFIGS): Day/Week/Month with the #4285F4 calendar accent.
      // ?tab=day activates a tab so the accent renders in SSR markup.
      mockCurrentSearchParams = new URLSearchParams('tab=day');
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Calendar Content</div>
        </AppShell>,
      );

      // QuantPillarTopBar has calendar active
      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#4285F4');

      // Contextual tabs now live in the bottom bar (top strip removed)
      expect(html).toContain('Calendar contextual navigation');
      expect(html).toContain('>Day<');
      expect(html).toContain('>Week<');
      expect(html).toContain('>Month<');

      // Single bottom bar only — no app-switcher duplicate, no top strip
      expect(html).not.toContain('App pillars');
      expect(html).not.toContain('sub-navigation');
    });

    it('mounts the contextual bottom nav on Drive route (/drive)', () => {
      mockCurrentPathname = '/drive';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Drive Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#34A853');

      expect(html).toContain('Drive contextual navigation');
      expect(html).toContain('>My Drive<');
      expect(html).toContain('>Recent<');
      expect(html).toContain('>Starred<');

      expect(html).not.toContain('App pillars');
      expect(html).not.toContain('sub-navigation');
    });

    it('mounts the contextual bottom nav on Contacts route (/contacts)', () => {
      mockCurrentPathname = '/contacts';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Contacts Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#F59E0B');

      // Contacts contextual tabs live in the shell bottom bar
      expect(html).toContain('Contacts contextual navigation');
      expect(html).toContain('>All<');
      expect(html).toContain('>Favorites<');
      expect(html).not.toContain('sub-navigation');
      expect(html).not.toContain('App pillars');
    });

    it('mounts the Gemini-approved contextual bottom nav on QuantGit route (/quantgit)', () => {
      mockCurrentPathname = '/quantgit';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>QuantGit Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#8B5CF6');

      // QuantGit bottom tabs: Repositories → Overview. No top strip, no
      // app-switcher duplicate.
      expect(html).toContain('QuantGit contextual navigation');
      expect(html).toContain('>Repositories<');
      expect(html).toContain('>Overview<');
      expect(html).not.toContain('sub-navigation');

      expect(html).not.toContain('App pillars');
    });
  });

  // ==========================================================================
  describe('Seamless customHeader Integration', () => {
    it('renders customHeader and suppresses QuantPillarTopBar when customHeader is active', () => {
      mockCurrentPathname = '/';
      const customHeader = (
        <div id="selection-header-test" data-testid="selection-header">
          3 Conversations Selected
        </div>
      );

      const html = renderToStaticMarkup(
        <AppShell
          sidebar={<div id="sidebar-test">Sidebar</div>}
          customHeader={customHeader}
        >
          <div>Selected Rows View</div>
        </AppShell>,
      );

      // customHeader is mounted
      expect(html).toContain('selection-header-test');
      expect(html).toContain('3 Conversations Selected');

      // QuantPillarTopBar is seamlessly suppressed
      expect(html).not.toContain('Super-App 5-Pillar Navigation Bar');
    });

    it('renders custom topBar override when topBar prop is explicitly passed', () => {
      mockCurrentPathname = '/';
      const customTopBar = (
        <div id="custom-top-bar" data-testid="custom-top-bar">
          Custom Metric Bar
        </div>
      );

      const html = renderToStaticMarkup(
        <AppShell
          sidebar={<div id="sidebar-test">Sidebar</div>}
          topBar={customTopBar}
        >
          <div>View Content</div>
        </AppShell>,
      );

      expect(html).toContain('custom-top-bar');
      expect(html).toContain('Custom Metric Bar');
      expect(html).not.toContain('Super-App 5-Pillar Navigation Bar');
    });
  });

  // ==========================================================================
  // 3. Suppression on Deep Non-Suite Routes
  // ==========================================================================
  describe('Suppression on Non-Suite Routes', () => {
    it('suppresses QuantPillarTopBar on deep detail route (/thread/123)', () => {
      mockCurrentPathname = '/thread/123';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Thread Detail</div>
        </AppShell>,
      );

      expect(html).not.toContain('Super-App 5-Pillar Navigation Bar');
      // No bottom nav at all on /thread (contextual bar returns null there)
      expect(html).not.toContain('App pillars');
      expect(html).not.toContain('contextual navigation');
    });

    it('suppresses QuantPillarTopBar on composer route (/compose)', () => {
      mockCurrentPathname = '/compose';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Compose Email</div>
        </AppShell>,
      );

      expect(html).not.toContain('Super-App 5-Pillar Navigation Bar');
      // No bottom nav at all on /compose (contextual bar returns null there)
      expect(html).not.toContain('App pillars');
      expect(html).not.toContain('contextual navigation');
    });
  });

  // ==========================================================================
  // 4. Invariants: Pure SVG Vector Engine & Zero Raw Unicode Emojis
  // ==========================================================================
  describe('Invariants & Standards', () => {
    it('contains strictly zero raw Unicode emojis across the rendered markup', () => {
      mockCurrentPathname = '/';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div>Sidebar</div>}>
          <div>Test View</div>
        </AppShell>,
      );

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('preserves desktop pinned sidebar and drawer structures', () => {
      mockCurrentPathname = '/';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div className="sidebar-inner">Sidebar Items</div>}>
          <div>Main Body</div>
        </AppShell>,
      );

      expect(html).toContain('sidebar-inner');
      expect(html).toContain('Close navigation menu');
      // 2026-10-10 desktop redesign: the header hamburger is gone (the rail
      // is always pinned), so nothing may advertise opening the navigation.
      // (The pinned rail itself needs matchMedia/localStorage effects, so it
      // only renders in a real browser — DesktopContextSidebar is covered
      // directly in desktop-context-sidebar.test.tsx.)
      expect(html).not.toContain('Open navigation menu');
      expect(html).toContain('main-content');
    });
  });
});
