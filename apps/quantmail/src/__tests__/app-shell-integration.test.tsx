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

describe('AppShell — Super-App 5-Pillar Top Squircle & Context Bottom Nav Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
    mockCurrentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Suite Route Pillar TopBar & Context BottomNavBar Mounting
  // ==========================================================================
  describe('Mounting on Main Suite Routes', () => {
    it('mounts QuantPillarTopBar and ContextBottomNavBar on Mail suite route (/)', () => {
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

      // ContextBottomNavBar is present for Mail
      expect(html).toContain('Mail contextual navigation');
      expect(html).toContain('Inbox');
      expect(html).toContain('Teams');
      expect(html).toContain('Agents');
      expect(html).toContain('Archive');
    });

    it('mounts QuantPillarTopBar and ContextBottomNavBar on Calendar route (/calendar)', () => {
      mockCurrentPathname = '/calendar';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Calendar Content</div>
        </AppShell>,
      );

      // QuantPillarTopBar has calendar active
      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#F59E0B');

      // ContextBottomNavBar renders Calendar sub-tabs
      expect(html).toContain('Calendar contextual navigation');
      expect(html).toContain('Feed');
      expect(html).toContain('Month');
      expect(html).toContain('Events');
      expect(html).toContain('Schedule');
    });

    it('mounts QuantPillarTopBar and ContextBottomNavBar on Drive route (/drive)', () => {
      mockCurrentPathname = '/drive';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Drive Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#38BDF8');

      expect(html).toContain('Drive contextual navigation');
      expect(html).toContain('Home');
      expect(html).toContain('Feed');
      expect(html).toContain('AI Memory');
      expect(html).toContain('Vault');
    });

    it('mounts QuantPillarTopBar and ContextBottomNavBar on Contacts route (/contacts)', () => {
      mockCurrentPathname = '/contacts';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Contacts Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#10B981');

      expect(html).toContain('Contacts contextual navigation');
      expect(html).toContain('Home');
      expect(html).toContain('Favorites');
      expect(html).toContain('Groups');
      expect(html).toContain('Companies');
      expect(html).toContain('AI Dedup');
    });

    it('mounts QuantPillarTopBar and ContextBottomNavBar on QuantGit route (/quantgit)', () => {
      mockCurrentPathname = '/quantgit';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>QuantGit Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('#A78BFA');

      expect(html).toContain('QuantGit contextual navigation');
      expect(html).toContain('Repos');
      expect(html).toContain('PRs');
      expect(html).toContain('Issues');
      expect(html).toContain('Actions');
      expect(html).toContain('Copilot');
    });
  });

  // ==========================================================================
  // 2. Seamless Integration with customHeader
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
      // ContextBottomNavBar returns null for /thread
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
      // ContextBottomNavBar returns null for /compose
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
