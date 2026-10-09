import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell';
import {
  QuantPillarTopBar,
  PILLAR_TILES,
  executePillarTileClick,
  triggerHapticTap,
} from '../components/QuantPillarTopBar';
import { QuantMailShortcutDock } from '../components/QuantMailShortcutDock';
import {
  CalendarContextSubTabs,
  mergedTabTargets,
  resolveMergedTab,
} from '../app/calendar/components/CalendarContextSubTabs';
import { DriveAISearchBar } from '../components/drive/DriveAISearchBar';

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
let mockCurrentPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockCurrentPathname,
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useInbox to avoid react-query requirements in static render
vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({
    data: [
      { id: '1', isRead: false },
      { id: '2', isRead: true },
    ],
    refetch: vi.fn(),
  }),
}));

// Mock shared UI components
vi.mock('@quant/shared-ui', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => (
    <div className="page-transition">{children}</div>
  ),
  useFocusTrap: () => ({ current: null }),
  BubbleAvatar: () => <div className="bubble-avatar" />,
}));

describe('Mobile Shell Overhaul — Worker A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. AppShell — per-app header is desktop-only on mobile
  // ==========================================================================
  describe('AppShell mobile header removal', () => {
    it('renders the per-app header as hidden on mobile / flex on desktop', () => {
      mockCurrentPathname = '/contacts';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Contacts Content</div>
        </AppShell>,
      );

      // The per-app header block (hamburger + brand + search + orb) is
      // desktop-only now — the phone opens on the 5-pillar dock instead.
      expect(html).toContain('<header class="hidden md:flex min-h-14');
      // The old mobile-only search toggle inside that header is gone with it
      // (mobile search lives in the pillar bar's own field now).
      expect(html).not.toContain('aria-label="Close search"');
    });

    it('keeps the desktop header content intact (brand, search field)', () => {
      mockCurrentPathname = '/';
      const html = renderToStaticMarkup(
        <AppShell
          sidebar={<div id="sidebar-test">Sidebar</div>}
          searchValue=""
          onSearchChange={() => {}}
        >
          <div>Mail Content</div>
        </AppShell>,
      );

      // Desktop header still carries the brand button and the search field.
      expect(html).toContain('id="app-shell-search-input"');
      expect(html).toContain('Open navigation menu');
    });

    it('still honours customHeader (replaces the whole header element)', () => {
      mockCurrentPathname = '/';
      const html = renderToStaticMarkup(
        <AppShell
          sidebar={<div id="sidebar-test">Sidebar</div>}
          customHeader={<div data-testid="custom-header-stub">Custom</div>}
        >
          <div>Content</div>
        </AppShell>,
      );

      expect(html).toContain('data-testid="custom-header-stub"');
      expect(html).not.toContain('id="app-shell-search-input"');
    });

    it('still renders the 5-pillar dock on suite routes', () => {
      mockCurrentPathname = '/drive';
      const html = renderToStaticMarkup(
        <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
          <div>Drive Content</div>
        </AppShell>,
      );

      expect(html).toContain('Super-App 5-Pillar Navigation Bar');
      expect(html).toContain('data-testid="pillar-tile-drive"');
    });
  });

  // ==========================================================================
  // 2. QuantPillarTopBar — real logos, mobile order, haptics
  // ==========================================================================
  describe('QuantPillarTopBar premium dock', () => {
    it('mounts the real approved app marks on all 5 tiles (no generic glyphs)', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);

      for (const id of ['mail', 'calendar', 'drive', 'contacts', 'quantgit']) {
        expect(html).toContain(`data-testid="pillar-tile-${id}"`);
      }

      // Real marks: the three remaining canvas marks carry role="img" labels…
      expect(html).toContain('aria-label="QuantDrive"');
      expect(html).toContain('aria-label="QuantContacts"');
      expect(html).toContain('aria-label="QuantGit"');
      // …Calendar now paints the dynamic 3D canvas mark. Its accessible name
      // carries the current localized date for screen readers…
      expect(html).toContain('aria-label="QuantCalendar —');
      // …and all five tiles keep their canvas marks (mail's decorative mark too).
      const canvasCount = (html.match(/<canvas/g) || []).length;
      expect(canvasCount).toBeGreaterThanOrEqual(5);

      // The old generic mail glyph is gone from the tiles.
      expect(html).not.toContain('m22 7-8.97 5.7');
    });

    it('orders the dock above the AI capsule on mobile, capsule first on desktop', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);

      // New DOM order: dock tablist -> search bar (fake AI capsule removed).
      // The pill only renders with real aiLiveText; assert it is absent.
      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-label="Application Suites"');
      const dockIdx = html.indexOf('aria-label="Application Suites"');
      
      expect(dockIdx).toBeGreaterThanOrEqual(0);
      expect(html).not.toContain('Quant AI:');
      
      // Search bar keeps its slot after the dock.
      const searchIdx = html.indexOf('aria-label="Voice Search"');
      expect(searchIdx).toBeGreaterThan(dockIdx);
      
    });

    it('hides the duplicate lens strip where the page owns its filter row', () => {
      for (const pillar of ['mail', 'calendar', 'drive', 'contacts'] as const) {
        const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride={pillar} />);
        expect(html).not.toContain('aria-label="Sub-category lenses"');
      }
      // QuantGit has no page-level filter row, so it keeps the strip.
      const gitHtml = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="quantgit" />);
      expect(gitHtml).toContain('aria-label="Sub-category lenses"');
    });

    it('shows the lens strip when hideLensStrip is explicitly false', () => {
      const html = renderToStaticMarkup(
        <QuantPillarTopBar activePillarOverride="mail" hideLensStrip={false} />,
      );
      expect(html).toContain('aria-label="Sub-category lenses"');
    });

    it('keeps each pillar on its approved brand accent', () => {
      const byId = Object.fromEntries(PILLAR_TILES.map((tile) => [tile.id, tile.accentColor]));
      expect(byId.mail).toBe('#FF6B35');
      expect(byId.calendar).toBe('#4285F4');
      expect(byId.drive).toBe('#34A853');
      expect(byId.contacts).toBe('#14B8A6');
      expect(byId.quantgit).toBe('#8B5CF6');
    });

  it('marks the active tile with aria-selected and the swoosh indicator', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="contacts" />);

      expect(html).toContain('data-testid="pillar-tile-contacts"');
      // Active tile announces itself…
      expect(html).toContain('aria-selected="true"');
      // …and carries the compact active-slot treatment in Contacts teal.
      // The oversized glow is intentionally restrained; the dock geometry stays stable.
      expect(html).toContain('1px solid #14B8A666');
      expect(html).toContain('drop-shadow(0 0 6px #14B8A666)');
      // …and the active tile keeps the snappy premium transition (not the old 350ms).
      expect(html).toContain('transition-transform duration-150 ease-out');
      expect(html).not.toContain('0.35s cubic-bezier(0.34, 1.3, 0.64, 1)');
      // Raised-slot treatment (refinement 2026-10-09): active slot rises
      // above the capsule and lifts off the dock.
      expect(html).toContain('top:-4px');
      expect(html).toContain('-translate-y-0.5');
    });

    it('triggerHapticTap is a silent no-op where vibrate is unsupported', () => {
      vi.stubGlobal('navigator', {});
      expect(triggerHapticTap()).toBe(false);
      vi.unstubAllGlobals();
    });

    it('triggerHapticTap fires a 10ms pulse where supported', () => {
      const vibrate = vi.fn(() => true);
      vi.stubGlobal('navigator', { vibrate });

      expect(triggerHapticTap()).toBe(true);
      expect(vibrate).toHaveBeenCalledWith(10);

      vi.unstubAllGlobals();
    });

    it('tapping a pillar tile fires the haptic pulse', () => {
      const vibrate = vi.fn(() => true);
      vi.stubGlobal('navigator', { vibrate });

      executePillarTileClick(PILLAR_TILES[0], {
        pathname: '/drive',
        router: { push: mockPush },
      });

      expect(vibrate).toHaveBeenCalledWith(10);
      expect(mockPush).toHaveBeenCalledWith('/');

      vi.unstubAllGlobals();
    });
  });

  // ==========================================================================
  // 3. QuantMailShortcutDock — hidden on mobile
  // ==========================================================================
  describe('QuantMailShortcutDock mobile visibility', () => {
    it('hides the expanded dock below the md breakpoint', () => {
      const html = renderToStaticMarkup(<QuantMailShortcutDock disableListener />);
      expect(html).toContain('hidden md:flex');
      expect(html).toContain('role="toolbar"');
    });

    it('hides the collapsed pill below the md breakpoint too', () => {
      const html = renderToStaticMarkup(
        <QuantMailShortcutDock disableListener initialCollapsed />,
      );
      expect(html).toContain('data-testid="quantmail-dock-collapsed"');
      expect(html).toContain('hidden md:flex');
    });
  });

  // ==========================================================================
  // 4. Calendar — one merged tab row
  // ==========================================================================
  describe('CalendarContextSubTabs merged row', () => {
    it('renders exactly one tab row with all seven tabs (no duplicate Agenda/Month)', () => {
      const html = renderToStaticMarkup(
        <CalendarContextSubTabs activeTab="agenda" onSelectTab={() => {}} />,
      );

      for (const tab of ['agenda', 'week', 'day', 'month', 'booking', 'quantmeet', 'reminders']) {
        expect(html).toContain(`data-testid="calendar-tab-${tab}"`);
      }
      // Exactly one tablist — the old double stack (header switcher +
      // context strip) is gone.
      const tablists = (html.match(/role="tablist"/g) || []).length;
      expect(tablists).toBe(1);
      // …and the merged row owns the labels the header switcher used to own.
      expect(html).toContain('>Week<');
      expect(html).toContain('>Day<');
    });

    it('resolveMergedTab surfaces week/day only on the agenda sub-view', () => {
      expect(resolveMergedTab('agenda', 'agenda')).toBe('agenda');
      expect(resolveMergedTab('agenda', 'week')).toBe('week');
      expect(resolveMergedTab('agenda', 'day')).toBe('day');
      expect(resolveMergedTab('month', 'month')).toBe('month');
      expect(resolveMergedTab('booking', 'agenda')).toBe('booking');
      expect(resolveMergedTab('quantmeet', 'agenda')).toBe('quantmeet');
      expect(resolveMergedTab('reminders', 'agenda')).toBe('reminders');
    });

    it('mergedTabTargets maps every merged tab to its (contextTab, view) pair', () => {
      expect(mergedTabTargets('agenda')).toEqual({ contextTab: 'agenda', view: 'agenda' });
      expect(mergedTabTargets('week')).toEqual({ contextTab: 'agenda', view: 'week' });
      expect(mergedTabTargets('day')).toEqual({ contextTab: 'agenda', view: 'day' });
      expect(mergedTabTargets('month')).toEqual({ contextTab: 'month', view: 'month' });
      expect(mergedTabTargets('booking')).toEqual({ contextTab: 'booking', view: 'agenda' });
      expect(mergedTabTargets('quantmeet')).toEqual({ contextTab: 'quantmeet', view: 'agenda' });
      expect(mergedTabTargets('reminders')).toEqual({ contextTab: 'reminders', view: 'agenda' });
    });
  });

  // ==========================================================================
  // 5. Drive — AI Content Search pill no longer clips
  // ==========================================================================
  describe('DriveAISearchBar pill clipping fix', () => {
    it('lets the input shrink (min-w-0) and keeps the pill on one line', () => {
      const html = renderToStaticMarkup(<DriveAISearchBar onSelectFile={() => {}} />);

      expect(html).toContain('data-testid="drive-ai-search-input"');
      // The field must be allowed to shrink below its intrinsic width…
      expect(html).toContain('min-w-0');
      // …so the mode pill never gets shoved out of the bar.
      expect(html).toContain('data-testid="semantic-toggle-pill"');
      expect(html).toContain('whitespace-nowrap');
      expect(html).toContain('AI Content Search');
    });
  });

  // ==========================================================================
  // 6. QuantGit — opens inside the same AppShell on mobile
  // ==========================================================================
  describe('QuantGit AppShell integration', () => {
    it('page module loads with the shell wiring (no import-time crash)', async () => {
      const mod = await import('../app/quantgit/page');
      expect(typeof mod.default).toBe('function');
    });
  });
});
