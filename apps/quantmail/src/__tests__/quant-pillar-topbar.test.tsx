import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantPillarTopBar,
  PILLAR_TILES,
  PILLAR_LENSES,
  executePillarTileClick,
  executeLensClick,
  executeLiveCapsuleClick,
  executeVoiceMicClick,
  executeSearchKeyDown,
  type PillarId,
} from '../components/QuantPillarTopBar';

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: mockPrefetch,
  }),
  usePathname: () => mockCurrentPathname,
  useSearchParams: () => new URLSearchParams(),
}));

// Mock auth: the mobile avatar mounts the real AccountBadge menu, which reads
// the current user from the auth provider.
vi.mock('../providers/auth-provider', () => ({
  useOptionalAuth: () => ({
    user: { id: 'u1', email: 'test@quantmail.in', displayName: 'Test User', username: 'test' },
    logout: vi.fn(),
  }),
  useAuth: () => {
    throw new Error('useAuth must be used within an AuthProvider');
  },
}));

describe('QuantPillarTopBar — Super-App 5-Pillar Squircle Mode Switcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Amazon & Flipkart Super-App 5 Squircle Mode Switcher Tiles Rendering
  // ==========================================================================
  describe('Amazon & Flipkart Super-App 5 Squircle Mode Switcher Tiles', () => {
    it('renders all 5 sovereign pillars with their exact identifiers and labels', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);

      // Verify all 5 pillar labels exist
      expect(html).toContain('Mail');
      expect(html).toContain('Calendar');
      expect(html).toContain('Drive');
      expect(html).toContain('Contacts');
      expect(html).toContain('QuantGit');

      // Check pillar tiles count and configuration
      expect(PILLAR_TILES).toHaveLength(5);
      expect(PILLAR_TILES.map((p) => p.id)).toEqual([
        'mail',
        'calendar',
        'drive',
        'contacts',
        'quantgit',
      ]);
    });

    it('applies Gmail-style Orange/Red active styling to Mail tile when active', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);

      // QM-UIUX-072/073: pure-black header bar (--quant-background is
      // #000000 in dark theme), no blur tint, no dividers.
      expect(html).toContain('background:var(--quant-background)');
      expect(html).not.toContain('rgba(13,13,18,0.96)');
      // Active-only markers: these strings render ONLY when Mail is active —
      // the swoosh ribbon border/glow and the active logo glow.
      // (Bare 'var(--quant-primary)' / '#FF6B35' are global: AI capsule, search ring and the
      // profile avatar all carry them, so they prove nothing per-pillar.)
      expect(html).toContain('1px solid #FF6B3566');
      expect(html).toContain('drop-shadow(0 0 6px #FF6B3566)');
      // Compact raised-slot treatment keeps the active app connected without
      // allowing its capsule to overpower the surrounding icons.
      expect(html).toContain('top:-4px');
      expect(html).toContain('-translate-y-0.5');
    });

    it('applies professional Blue active styling to Calendar tile when active', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="calendar" />);

      // QM-UIUX-072/073: pure-black header bar (--quant-background is
      // #000000 in dark theme), no blur tint, no dividers.
      expect(html).toContain('background:var(--quant-background)');
      expect(html).not.toContain('rgba(13,13,18,0.96)');
      // Active-only: swoosh + glow in Calendar's blue.
      expect(html).toContain('1px solid #4285F466');
      expect(html).toContain('drop-shadow(0 0 6px #4285F466)');
    });

    it('applies Google Drive-style colors to Drive tile when active', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="drive" />);

      // QM-UIUX-072/073: pure-black header bar (--quant-background is
      // #000000 in dark theme), no blur tint, no dividers.
      expect(html).toContain('background:var(--quant-background)');
      expect(html).not.toContain('rgba(13,13,18,0.96)');
      // Active-only: swoosh + glow in Drive's green.
      expect(html).toContain('1px solid #34A85366');
      expect(html).toContain('drop-shadow(0 0 6px #34A85366)');
    });

    it('applies Teal active styling to Contacts tile when active', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="contacts" />);

      // QM-UIUX-072/073: pure-black header bar (--quant-background is
      // #000000 in dark theme), no blur tint, no dividers.
      expect(html).toContain('background:var(--quant-background)');
      expect(html).not.toContain('rgba(13,13,18,0.96)');
      // Active-only: compact slot and glow use the Contacts teal accent.
      expect(html).toContain('1px solid #14B8A666');
      expect(html).toContain('drop-shadow(0 0 6px #14B8A666)');
    });

    it('applies Violet active styling to QuantGit tile when active', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="quantgit" />);

      // QM-UIUX-072/073: pure-black header bar (--quant-background is
      // #000000 in dark theme), no blur tint, no dividers.
      expect(html).toContain('background:var(--quant-background)');
      expect(html).not.toContain('rgba(13,13,18,0.96)');
      // Active-only: QuantGit uses its approved violet identity.
      expect(html).toContain('1px solid #8B5CF666');
      expect(html).toContain('drop-shadow(0 0 6px #8B5CF666)');
    });

    it('renders unread/count badges when provided in unreadCounts prop', () => {
      const html = renderToStaticMarkup(
        <QuantPillarTopBar
          activePillarOverride="mail"
          unreadCounts={{ mail: 7, calendar: 2, drive: 0, contacts: 14, quantgit: 3 }}
        />,
      );

      expect(html).toContain('7');
      expect(html).toContain('2');
      expect(html).toContain('14');
      expect(html).toContain('3');
    });

    it('never ships hardcoded numeric lens badges in the pillar config', () => {
      // Regression guard for the phantom-counts bug: the config may carry
      // static string labels (e.g. 'E2EE') but no fabricated numbers.
      for (const [pillar, lenses] of Object.entries(PILLAR_LENSES)) {
        for (const lens of lenses) {
          expect(
            typeof lens.badge !== 'number',
            `${pillar}/${lens.id} must not hardcode a numeric badge`,
          ).toBe(true);
        }
      }
    });

    it('renders lens badges from live lensCounts and omits them when absent', () => {
      // The lens strip is hidden by default for pillars with native page-level
      // filters (mail/calendar/drive/contacts) — opt in explicitly to test it.
      const withCounts = renderToStaticMarkup(
        <QuantPillarTopBar
          activePillarOverride="mail"
          hideLensStrip={false}
          lensCounts={{ mail: { all: 47, important: 19 } }}
        />,
      );
      expect(withCounts).toContain('>47<');
      expect(withCounts).toContain('>19<');

      const withoutCounts = renderToStaticMarkup(
        <QuantPillarTopBar activePillarOverride="mail" hideLensStrip={false} />,
      );
      // Labels still render; no numeric badge may appear anywhere in the strip.
      expect(withoutCounts).toContain('Important');
      expect(withoutCounts).toContain('Teams');
      expect(withoutCounts).not.toMatch(/<span[^>]*font-mono[^>]*>\d+<\/span>/);
    });

    it('hides the lens strip by default for pillars with native page-level filters', () => {
      // Regression guard for the duplicate-strip removal: mail/calendar/drive/
      // contacts pages render their own richer filter rows, so the topbar strip
      // stays hidden unless hideLensStrip={false}. QuantGit has no page-level
      // filter row, so it keeps the strip.
      for (const pillar of ['mail', 'calendar', 'drive', 'contacts'] as const) {
        const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride={pillar} />);
        expect(html).not.toContain('Sub-category lenses');
      }
      const gitHtml = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="quantgit" />);
      expect(gitHtml).toContain('Sub-category lenses');
    });
  });

  // ==========================================================================
  // 2. Click Interactions for Pillar Tiles & Routing
  // ==========================================================================
  describe('Pillar Tiles Click Interactions & Routing Callbacks', () => {
    it('clicking each pillar tile invokes onPillarSelect, onPillarChange, router.push, and dispatches quant:pillar-change event', () => {
      const onPillarSelect = vi.fn();
      const onPillarChange = vi.fn();
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      // 1. Calendar tile click
      const calTile = PILLAR_TILES.find((t) => t.id === 'calendar')!;
      executePillarTileClick(calTile, {
        pathname: '/',
        router: { push: mockPush },
        onPillarSelect,
        onPillarChange,
      });

      expect(onPillarSelect).toHaveBeenCalledWith('calendar');
      expect(onPillarChange).toHaveBeenCalledWith('calendar', '/calendar');
      expect(mockPush).toHaveBeenCalledWith('/calendar');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quant:pillar-change',
          detail: { pillar: 'calendar', path: '/calendar' },
        }),
      );

      // 2. Drive tile click
      const driveTile = PILLAR_TILES.find((t) => t.id === 'drive')!;
      executePillarTileClick(driveTile, {
        pathname: '/',
        router: { push: mockPush },
        onPillarSelect,
        onPillarChange,
      });

      expect(onPillarSelect).toHaveBeenCalledWith('drive');
      expect(onPillarChange).toHaveBeenCalledWith('drive', '/drive');
      expect(mockPush).toHaveBeenCalledWith('/drive');

      // 3. Contacts tile click
      const contactsTile = PILLAR_TILES.find((t) => t.id === 'contacts')!;
      executePillarTileClick(contactsTile, {
        pathname: '/',
        router: { push: mockPush },
        onPillarSelect,
        onPillarChange,
      });

      expect(onPillarSelect).toHaveBeenCalledWith('contacts');
      expect(onPillarChange).toHaveBeenCalledWith('contacts', '/contacts');
      expect(mockPush).toHaveBeenCalledWith('/contacts');

      // 4. QuantGit tile click
      const gitTile = PILLAR_TILES.find((t) => t.id === 'quantgit')!;
      executePillarTileClick(gitTile, {
        pathname: '/',
        router: { push: mockPush },
        onPillarSelect,
        onPillarChange,
      });

      expect(onPillarSelect).toHaveBeenCalledWith('quantgit');
      expect(onPillarChange).toHaveBeenCalledWith('quantgit', '/quantgit');
      expect(mockPush).toHaveBeenCalledWith('/quantgit');

      // 5. Mail tile click
      const mailTile = PILLAR_TILES.find((t) => t.id === 'mail')!;
      executePillarTileClick(mailTile, {
        pathname: '/calendar',
        router: { push: mockPush },
        onPillarSelect,
        onPillarChange,
      });

      expect(onPillarSelect).toHaveBeenCalledWith('mail');
      expect(onPillarChange).toHaveBeenCalledWith('mail', '/');
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  // ==========================================================================
  // 3. Dynamic Island Quant AI Live Capsule
  // ==========================================================================
  describe('Dynamic Island Quant AI Live Capsule', () => {
    it('renders the frosted obsidian capsule with pulsing molten orb when aiLiveText is supplied', () => {
      const html = renderToStaticMarkup(
        <QuantPillarTopBar aiLiveText="Quant AI: 3 urgent items prioritized" />,
      );

      // Frosted pill container
      expect(html).toContain('rounded-full bg-[var(--quant-surface)]/90 border border-[#232938]');

      // Molten pulsing orb
      expect(html).toContain('animate-ping rounded-full bg-[var(--quant-primary)]');
      expect(html).toContain('rounded-full bg-[var(--quant-primary)] shadow-[0_0_6px_var(--quant-primary)]');

      // Live text
      expect(html).toContain('Quant AI: 3 urgent items prioritized');
    });

    it('renders nothing for the live capsule when aiLiveText is not supplied (no fake status)', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar />);

      expect(html).not.toContain('3 urgent items prioritized');
      expect(html).not.toContain('5ms E2EE');
      expect(html).not.toContain('rounded-full bg-[var(--quant-surface)]/90 border border-[#232938]');
    });

    it('renders custom live AI text when aiLiveText prop is supplied', () => {
      const html = renderToStaticMarkup(
        <QuantPillarTopBar aiLiveText="Quant AI: All 12 drafts analyzed and synced" />,
      );

      expect(html).toContain('Quant AI: All 12 drafts analyzed and synced');
    });

    it('renders a dismiss control for the live capsule when aiLiveText is supplied', () => {
      const html = renderToStaticMarkup(
        <QuantPillarTopBar aiLiveText="Quant AI: 3 urgent items prioritized" />,
      );

      // Dismiss button is present and labelled for assistive tech.
      expect(html).toContain('aria-label="Dismiss Quant AI status"');
    });

    it('renders no dismiss control when aiLiveText is not supplied (no fake status)', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar />);

      expect(html).not.toContain('aria-label="Dismiss Quant AI status"');
    });

    it('mounts the switcher and search in ONE shared sticky bar (P1-F, no stacked stickies)', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);

      // Exactly one sticky top bar — the switcher section and the search row
      // share it; the old separate `sticky top-0 z-20` search element is gone.
      const stickyBars = html.split('class="sticky top-0 z-30 w-full"').length - 1;
      expect(stickyBars).toBe(1);
      expect(html).not.toContain('sticky top-0 z-20');

      // DOM order inside the bar: dock tablist first, search field after it.
      const dockIdx = html.indexOf('aria-label="Application Suites"');
      const searchIdx = html.indexOf('aria-label="Voice Search"');
      expect(dockIdx).toBeGreaterThanOrEqual(0);
      expect(searchIdx).toBeGreaterThan(dockIdx);
    });

    it('clicking live capsule invokes onQuantyClick, onOpenCopilot, and dispatches window events', () => {
      const onQuantyClick = vi.fn();
      const onOpenCopilot = vi.fn();
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      executeLiveCapsuleClick({
        onQuantyClick,
        onOpenCopilot,
      });

      expect(onQuantyClick).toHaveBeenCalledTimes(1);
      expect(onOpenCopilot).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'quant:copilot:open' }),
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'quant:quanty:open' }),
      );
    });
  });

  // ==========================================================================
  // 4. Sticky Voice Search Bar & Mic Button
  // ==========================================================================
  describe('Sticky Voice Search Bar & Mic Button', () => {
    it('renders search input with 12dp rounded corners and contextual placeholder for Mail', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);

      expect(html).toContain('rounded-xl bg-[#16181F] border border-[#232938]');
      expect(html).toContain('placeholder="Search emails, senders, keywords…"');
    });

    it('swaps contextual placeholder when active pillar changes to Calendar, Drive, Contacts, or QuantGit', () => {
      const calHtml = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="calendar" />);
      expect(calHtml).toContain('placeholder="Search events, meetings, attendees…"');

      const driveHtml = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="drive" />);
      expect(driveHtml).toContain('placeholder="Search files, documents, FastCDC tags…"');

      const contactsHtml = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="contacts" />);
      expect(contactsHtml).toContain('placeholder="Search VIPs, contacts, companies…"');

      const gitHtml = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="quantgit" />);
      expect(gitHtml).toContain('placeholder="Search repositories, pull requests, commits…"');
    });

    it('renders dedicated microphone button for voice search', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar />);

      expect(html).toContain('aria-label="Voice Search"');
      expect(html).toContain('title="Voice Search"');
    });

    it('renders clear search button when search input contains text', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar searchValue="urgent quarterly invoice" />);

      expect(html).toContain('aria-label="Clear search"');
      expect(html).toContain('value="urgent quarterly invoice"');
    });

    it('handles search input Enter key submit and Escape key reset via executeSearchKeyDown', () => {
      const onSearchSubmit = vi.fn();
      const onSearchClear = vi.fn();
      const onSearchChange = vi.fn();

      // Enter key
      executeSearchKeyDown('Enter', 'project-x roadmap', {
        onSearchSubmit,
        onSearchClear,
        onSearchChange,
      });
      expect(onSearchSubmit).toHaveBeenCalledWith('project-x roadmap');

      // Escape key
      executeSearchKeyDown('Escape', 'temp text', {
        onSearchSubmit,
        onSearchClear,
        onSearchChange,
      });
      expect(onSearchChange).toHaveBeenCalledWith('');
      expect(onSearchClear).toHaveBeenCalledTimes(1);
    });

    it('clicking voice search mic button dispatches quant:voice-search-start event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      executeVoiceMicClick('calendar');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quant:voice-search-start',
          detail: { pillar: 'calendar' },
        }),
      );
    });
  });

  // ==========================================================================
  // 5. Horizontal Sub-Category Lenses Strip
  // ==========================================================================
  describe('Horizontal Sub-Category Lenses Strip', () => {
    it('renders Mail sub-category lenses: All 12, Important 3, Teams 5, Updates, Promos, Spam', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" hideLensStrip={false} />);

      expect(html).toContain('All');
      expect(html).toContain('12');
      expect(html).toContain('Important');
      expect(html).toContain('3');
      expect(html).toContain('Teams');
      expect(html).toContain('5');
      expect(html).toContain('Updates');
      expect(html).toContain('Promos');
      expect(html).toContain('Spam');
    });

    it('renders Calendar sub-category lenses: Today, Upcoming, Meetings, Reminders', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="calendar" hideLensStrip={false} />);

      expect(html).toContain('Today');
      expect(html).toContain('Upcoming');
      expect(html).toContain('Meetings');
      expect(html).toContain('Reminders');
    });

    it('renders Drive sub-category lenses: All Files, Docs, Media, Vault E2EE, FastCDC Clean', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="drive" hideLensStrip={false} />);

      expect(html).toContain('All Files');
      expect(html).toContain('Docs');
      expect(html).toContain('Media');
      expect(html).toContain('Vault');
      expect(html).toContain('E2EE');
      expect(html).toContain('FastCDC Clean');
    });

    it('renders Contacts sub-category lenses: All 8, VIPs 4, Teams, AI Dedup', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="contacts" hideLensStrip={false} />);

      expect(html).toContain('All');
      expect(html).toContain('8');
      expect(html).toContain('VIPs');
      expect(html).toContain('4');
      expect(html).toContain('Teams');
      expect(html).toContain('AI Dedup');
    });

    it('renders QuantGit sub-category lenses: All Repos, Open PRs 1, Issues, CI Runs', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="quantgit" />);

      expect(html).toContain('All Repos');
      expect(html).toContain('Open PRs');
      expect(html).toContain('1');
      expect(html).toContain('Issues');
      expect(html).toContain('CI Runs');
    });

    it('clicking a lens invokes onLensSelect, onLensChange, router.push with query param, and dispatches quant:lens-change', () => {
      const onLensSelect = vi.fn();
      const onLensChange = vi.fn();
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      const importantLens = PILLAR_LENSES.mail.find((l) => l.id === 'important')!;

      executeLensClick(importantLens, 'mail', {
        pathname: '/',
        router: { push: mockPush },
        onLensSelect,
        onLensChange,
      });

      expect(onLensSelect).toHaveBeenCalledWith('important');
      expect(onLensChange).toHaveBeenCalledWith('important', 'mail');
      expect(mockPush).toHaveBeenCalledWith('/?lens=important');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quant:lens-change',
          detail: { pillar: 'mail', lensId: 'important' },
        }),
      );
    });
  });

  // ==========================================================================
  // 6. Pure SVG Vector Engine — Strictly ZERO Raw Unicode Emojis Invariant
  // ==========================================================================
  describe('Pure SVG Vector Engine — Strictly ZERO Raw Unicode Emojis Invariant', () => {
    it('verifies that no raw Unicode emojis exist anywhere in the rendered HTML markup', () => {
      const pillars: PillarId[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];

      for (const pillar of pillars) {
        const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride={pillar} />);

        const emojiRegex =
          /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

        expect(emojiRegex.test(html)).toBe(false);

        // Explicit check against common raw emojis
        expect(html).not.toContain('🔍');
        expect(html).not.toContain('⚡');
        expect(html).not.toContain('🎤');
        expect(html).not.toContain('✉️');
        expect(html).not.toContain('📅');
        expect(html).not.toContain('📁');
        expect(html).not.toContain('👥');
        expect(html).not.toContain('✨');
      }
    });

    it('ensures all icons are rendered using SVG vector elements', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar />);

      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('aria-hidden="true"');
    });
  });

  describe('QM-UIUX-073 mobile chrome fixes', () => {
    it('collapses the switcher with a grid-rows animation (zero space when hidden, no blank gap)', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="drive" />);
      // The collapse wrapper animates grid-template-rows; it must NOT hold a
      // constant measured height (that left a blank gap on scroll).
      expect(html).toContain('grid-rows-[1fr]');
      expect(html).toContain('transition-[grid-template-rows]');
      expect(html).not.toContain('translateY(-105%)');
    });

    it('renders the sticky bar in pure black with no divider lines', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);
      // --quant-background is #000000 in the dark theme (QM-UIUX-072 law).
      expect(html).toContain('background:var(--quant-background)');
      expect(html).not.toContain('rgba(13,13,18,0.96)');
      expect(html).not.toContain('rgba(19,20,26');
    });

    it('always renders the Quanty ghost next to the search bar (never scroll-conditional)', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);
      // The ghost trigger is always in the DOM at full size — the old
      // scroll-conditional button collapsed to zero size until scrolled.
      expect(html).toContain('aria-label="Ask Quanty"');
      expect(html).toContain('size-10');
    });

    it('renders the account menu trigger instead of a direct-to-settings avatar', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);
      // AccountBadge compact trigger opens the real menu (switch account,
      // settings, sign out) — the old avatar pushed straight to /settings.
      expect(html).toContain('aria-haspopup="menu"');
      expect(html).toContain('Account menu:');
      expect(html).not.toContain('open settings');
    });

    it('gives every pillar tile its own per-app accent tint behind the logo', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="calendar" />);
      // Calendar tile must carry the blue accent tint (bug: it disappeared).
      expect(html).toContain('#4285F4');
      // Mail tile keeps its orange tint.
      expect(html).toContain('#FF6B35');
    });

    it('keeps the active slot compact and avoids excessive glow', () => {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);
      // A modest rounded active slot is intentional; the old oversized bloom is not.
      expect(html).toContain('border-radius:16px');
      expect(html).toContain('top:-4px');
      expect(html).not.toContain('0 0 40px #FF6B3528');
      expect(html).not.toContain('0 2px 12px rgba(0,0,0,0.35)');
    });
  });
});
