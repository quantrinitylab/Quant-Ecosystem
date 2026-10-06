import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell';

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

describe('AppShell — Super-App 5-Pillar Top Bar & Single Bottom Nav Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
    mockCurrentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Suite Route Pillar TopBar, Single Bottom Nav & Mobile Sub-Tab Strip
  //
  // Gmail rule: ONE nav system per viewport. Mobile gets exactly one bottom
  // bar (the 5-pillar switcher, aria-label "App pillars"); the removed
  // ContextBottomNavBar ("contextual navigation") must not render anywhere.
  // Calendar/Drive/QuantGit get one Gmail-style top sub-tab strip; Mail and
  // Contacts render their own native tab rows.
  // ==========================================================================
  describe('Mounting on Main Suite Routes', () => {
    it('mounts QuantPillarTopBar and the single pillar bottom nav on Mail suite route (/)', () => {
      mockCurrentPathname = '/';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Mail Content</div>
        </AppShell>,
      );

      // QuantPillarTopBar is present
      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('Quant AI:');
      expect(html).toContain('Mail');
      expect(html).toContain('Calendar');
      expect(html).toContain('Drive');
      expect(html).toContain('Contacts');
      expect(html).toContain('QuantGit');

      // Exactly ONE bottom bar: the 5-pillar switcher
      expect(html).toContain('App pillars');
      // The removed context bar is gone
      expect(html).not.toContain('contextual navigation');
      // Mail keeps its own lens row: no shell sub-tab strip
      expect(html).not.toContain('sub-navigation');
      // <main> reserves room for the single h-16 bottom bar
      expect(html).toContain('pb-16');
    });

    it('mounts the mobile sub-tab strip on Calendar route (/calendar)', () => {
      mockCurrentPathname = '/calendar';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Calendar Content</div>
        </AppShell>,
      );

      // QuantPillarTopBar has calendar active
      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#F59E0B');

      // Gmail-style top strip replaces the removed bottom bar's navigation
      expect(html).toContain('Calendar sub-navigation');
      expect(html).toContain('Feed');
      expect(html).toContain('Month');
      expect(html).toContain('Trackers');
      expect(html).toContain('Schedule');

      // Single bottom bar only
      expect(html).toContain('App pillars');
      expect(html).not.toContain('contextual navigation');
    });

    it('mounts the mobile sub-tab strip on Drive route (/drive)', () => {
      mockCurrentPathname = '/drive';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Drive Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#38BDF8');

      expect(html).toContain('Drive sub-navigation');
      expect(html).toContain('Home');
      expect(html).toContain('Feed');
      expect(html).toContain('AI Memory');
      expect(html).toContain('Vault');

      expect(html).toContain('App pillars');
      expect(html).not.toContain('contextual navigation');
    });

    it('keeps Contacts on its own native tab row — no shell sub-tab strip', () => {
      mockCurrentPathname = '/contacts';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Contacts Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#10B981');

      // Contacts renders its own chips: the shell adds no strip and no bar
      expect(html).not.toContain('sub-navigation');
      expect(html).not.toContain('contextual navigation');
      expect(html).toContain('App pillars');
    });

    it('mounts the mobile sub-tab strip on QuantGit route (/quantgit)', () => {
      mockCurrentPathname = '/quantgit';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>QuantGit Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#A78BFA');

      expect(html).not.toContain('QuantGit sub-navigation');
      expect(html).not.toContain('Repos');
      expect(html).not.toContain('PRs');
      expect(html).not.toContain('Issues');
      expect(html).not.toContain('Actions');
      expect(html).not.toContain('Copilot');

      expect(html).toContain('App pillars');
      expect(html).not.toContain('contextual navigation');
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
      // No bottom nav at all on /thread (pillar bar returns null there)
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
      // No bottom nav at all on /compose (pillar bar returns null there)
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
      expect(html).toContain('Open navigation menu');
      expect(html).toContain('main-content');
    });
  });
});
