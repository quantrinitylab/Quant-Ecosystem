import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ContextBottomNavBar,
  PILLAR_SUB_CONFIGS,
  resolveActiveTab,
  executeContextTabClick,
  type ProductivityPillar,
} from '../components/ContextBottomNavBar';

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

describe('Context-Specific Bottom Navigation Bar (ContextBottomNavBar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
    mockCurrentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Data Architecture for all 5 Sovereign Productivity Pillars
  // ==========================================================================
  describe('ContextBottomNavBar Data Architecture', () => {
    it('defines exactly 5 sovereign productivity pillars', () => {
      const pillars: ProductivityPillar[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];
      pillars.forEach((p) => {
        expect(PILLAR_SUB_CONFIGS[p]).toBeDefined();
        expect(PILLAR_SUB_CONFIGS[p].tabs).toHaveLength(5);
      });
    });

    it('Mail pillar config has [Inbox] (12), [Priority] (3), [Teams] (5), [Sent], [Archive]', () => {
      const mailConfig = PILLAR_SUB_CONFIGS.mail;
      expect(mailConfig.accentColor).toBe('#FF8C42');
      const tabIds = mailConfig.tabs.map((t) => t.id);
      expect(tabIds).toEqual(['inbox', 'priority', 'teams', 'sent', 'archive']);

      const inboxTab = mailConfig.tabs.find((t) => t.id === 'inbox');
      expect(inboxTab?.badgeCount).toBe(12);

      const priorityTab = mailConfig.tabs.find((t) => t.id === 'priority');
      expect(priorityTab?.badgeCount).toBe(3);

      const teamsTab = mailConfig.tabs.find((t) => t.id === 'teams');
      expect(teamsTab?.badgeCount).toBe(5);
    });

    it('Calendar pillar config has [Agenda], [Month], [Booking], [QuantMeet], [Reminders]', () => {
      const calConfig = PILLAR_SUB_CONFIGS.calendar;
      expect(calConfig.accentColor).toBe('#F59E0B');
      const tabIds = calConfig.tabs.map((t) => t.id);
      expect(tabIds).toEqual(['agenda', 'month', 'booking', 'quantmeet', 'reminders']);
    });

    it('Drive pillar config has [My Files], [Shared], [Vault] (E2EE), [Starred], [Cleaner] (CDC)', () => {
      const driveConfig = PILLAR_SUB_CONFIGS.drive;
      expect(driveConfig.accentColor).toBe('#38BDF8');
      const tabIds = driveConfig.tabs.map((t) => t.id);
      expect(tabIds).toEqual(['files', 'shared', 'vault', 'starred', 'cleaner']);

      const vaultTab = driveConfig.tabs.find((t) => t.id === 'vault');
      expect(vaultTab?.badgeText).toBe('E2EE');

      const cleanerTab = driveConfig.tabs.find((t) => t.id === 'cleaner');
      expect(cleanerTab?.badgeText).toBe('CDC');
    });

    it('Contacts pillar config has [Contacts] (8), [VIPs], [Companies], [AI Dedup], [Circles]', () => {
      const contactsConfig = PILLAR_SUB_CONFIGS.contacts;
      expect(contactsConfig.accentColor).toBe('#10B981');
      const tabIds = contactsConfig.tabs.map((t) => t.id);
      expect(tabIds).toEqual(['contacts', 'vips', 'companies', 'dedup', 'circles']);

      const contactsTab = contactsConfig.tabs.find((t) => t.id === 'contacts');
      expect(contactsTab?.badgeCount).toBe(8);
    });

    it('QuantGit pillar config has [Repos], [PRs] (1), [Issues], [Actions], [Copilot]', () => {
      const gitConfig = PILLAR_SUB_CONFIGS.quantgit;
      expect(gitConfig.accentColor).toBe('#A78BFA');
      const tabIds = gitConfig.tabs.map((t) => t.id);
      expect(tabIds).toEqual(['repos', 'prs', 'issues', 'actions', 'copilot']);

      const prsTab = gitConfig.tabs.find((t) => t.id === 'prs');
      expect(prsTab?.badgeCount).toBe(1);
    });
  });

  // ==========================================================================
  // 2. Component Rendering & Active Indicator Styling & Badges
  // ==========================================================================
  describe('ContextBottomNavBar Component Rendering & Styling', () => {
    it('renders Mail contextual tabs with obsidian frosted glass styling and badges', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="mail" activeTabOverride="inbox" />,
      );

      expect(html).toContain('Mail contextual navigation');
      expect(html).toContain('Inbox');
      expect(html).toContain('Priority');
      expect(html).toContain('Teams');
      expect(html).toContain('Sent');
      expect(html).toContain('Archive');

      // Badges
      expect(html).toContain('12');
      expect(html).toContain('3');
      expect(html).toContain('5');

      // Surface classes
      expect(html).toContain('bg-[#090A0E]/95');
      expect(html).toContain('backdrop-blur-md');
      expect(html).toContain('border-[#232938]');
      expect(html).toContain('aria-current="page"');
    });

    it('renders Calendar contextual tabs when pillar is calendar', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="calendar" activeTabOverride="agenda" />,
      );

      expect(html).toContain('Calendar contextual navigation');
      expect(html).toContain('Agenda');
      expect(html).toContain('Month');
      expect(html).toContain('Booking');
      expect(html).toContain('QuantMeet');
      expect(html).toContain('Reminders');
    });

    it('renders Drive contextual tabs with E2EE and CDC text badges', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="drive" activeTabOverride="vault" />,
      );

      expect(html).toContain('Drive contextual navigation');
      expect(html).toContain('My Files');
      expect(html).toContain('Shared');
      expect(html).toContain('Vault');
      expect(html).toContain('Starred');
      expect(html).toContain('Cleaner');
      expect(html).toContain('E2EE');
      expect(html).toContain('CDC');
    });

    it('renders Contacts contextual tabs with VIPs, AI Dedup, and 8 contact badge', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="contacts" activeTabOverride="vips" />,
      );

      expect(html).toContain('Contacts contextual navigation');
      expect(html).toContain('Contacts');
      expect(html).toContain('VIPs');
      expect(html).toContain('Companies');
      expect(html).toContain('AI Dedup');
      expect(html).toContain('Circles');
      expect(html).toContain('8');
    });

    it('renders QuantGit contextual tabs with PRs, Actions, and Copilot', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="quantgit" activeTabOverride="repos" />,
      );

      expect(html).toContain('QuantGit contextual navigation');
      expect(html).toContain('Repos');
      expect(html).toContain('PRs');
      expect(html).toContain('Issues');
      expect(html).toContain('Actions');
      expect(html).toContain('Copilot');
      expect(html).toContain('1');
    });

    it('renders active pill indicator dot matching pillar accent color', () => {
      const htmlMail = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="mail" activeTabOverride="inbox" />,
      );
      expect(htmlMail).toContain('background-color:#FF8C42');

      const htmlCalendar = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="calendar" activeTabOverride="agenda" />,
      );
      expect(htmlCalendar).toContain('background-color:#F59E0B');

      const htmlDrive = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="drive" activeTabOverride="files" />,
      );
      expect(htmlDrive).toContain('background-color:#38BDF8');

      const htmlContacts = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="contacts" activeTabOverride="contacts" />,
      );
      expect(htmlContacts).toContain('background-color:#10B981');

      const htmlQuantGit = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="quantgit" activeTabOverride="repos" />,
      );
      expect(htmlQuantGit).toContain('background-color:#A78BFA');
    });
  });

  // ==========================================================================
  // 3. Tab Resolution Engine (resolveActiveTab)
  // ==========================================================================
  describe('Tab Resolution Engine (resolveActiveTab)', () => {
    it('resolves Mail tabs based on path and search params', () => {
      expect(resolveActiveTab('mail', '/sent')).toBe('sent');
      expect(resolveActiveTab('mail', '/archive')).toBe('archive');
      expect(resolveActiveTab('mail', '/', new URLSearchParams('lens=important'))).toBe('priority');
      expect(resolveActiveTab('mail', '/', new URLSearchParams('lens=teams'))).toBe('teams');
      expect(resolveActiveTab('mail', '/', new URLSearchParams('lens=all'))).toBe('inbox');
    });

    it('resolves Calendar tabs based on search params', () => {
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=month'))).toBe('month');
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=booking'))).toBe('booking');
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=quantmeet'))).toBe('quantmeet');
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=reminders'))).toBe('reminders');
      expect(resolveActiveTab('calendar', '/calendar')).toBe('agenda');
    });

    it('resolves Drive tabs based on search params', () => {
      expect(resolveActiveTab('drive', '/drive', new URLSearchParams('tab=shared'))).toBe('shared');
      expect(resolveActiveTab('drive', '/drive', new URLSearchParams('tab=vault'))).toBe('vault');
      expect(resolveActiveTab('drive', '/drive', new URLSearchParams('tab=starred'))).toBe('starred');
      expect(resolveActiveTab('drive', '/drive', new URLSearchParams('tab=cleaner'))).toBe('cleaner');
      expect(resolveActiveTab('drive', '/drive')).toBe('files');
    });

    it('resolves Contacts tabs based on search params', () => {
      expect(resolveActiveTab('contacts', '/contacts', new URLSearchParams('tab=vips'))).toBe('vips');
      expect(resolveActiveTab('contacts', '/contacts', new URLSearchParams('tab=companies'))).toBe('companies');
      expect(resolveActiveTab('contacts', '/contacts', new URLSearchParams('tab=dedup'))).toBe('dedup');
      expect(resolveActiveTab('contacts', '/contacts', new URLSearchParams('tab=circles'))).toBe('circles');
      expect(resolveActiveTab('contacts', '/contacts')).toBe('contacts');
    });

    it('resolves QuantGit tabs based on search params', () => {
      expect(resolveActiveTab('quantgit', '/quantgit', new URLSearchParams('tab=prs'))).toBe('prs');
      expect(resolveActiveTab('quantgit', '/quantgit', new URLSearchParams('tab=issues'))).toBe('issues');
      expect(resolveActiveTab('quantgit', '/quantgit', new URLSearchParams('tab=actions'))).toBe('actions');
      expect(resolveActiveTab('quantgit', '/quantgit', new URLSearchParams('tab=copilot'))).toBe('copilot');
      expect(resolveActiveTab('quantgit', '/quantgit')).toBe('repos');
    });
  });

  // ==========================================================================
  // 4. Tab Click Interactions & Routing & Event Dispatch
  // ==========================================================================
  describe('ContextBottomNavBar Click Interactions', () => {
    it('clicking Mail sub-tabs invokes onTabChange, router.push, and dispatches quant:subtab-change event', () => {
      const onTabChange = vi.fn();
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      // Click "Priority" tab
      const priorityTab = PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'priority')!;
      executeContextTabClick(priorityTab, 'mail', {
        pathname: '/',
        router: { push: mockPush },
        onTabChange,
      });

      expect(onTabChange).toHaveBeenCalledWith('priority', 'mail');
      expect(mockPush).toHaveBeenCalledWith('/?lens=important');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quant:subtab-change',
          detail: {
            pillar: 'mail',
            tabId: 'priority',
            queryParam: { key: 'lens', value: 'important' },
          },
        }),
      );

      // Click "Teams" tab
      const teamsTab = PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'teams')!;
      executeContextTabClick(teamsTab, 'mail', {
        pathname: '/',
        router: { push: mockPush },
        onTabChange,
      });

      expect(onTabChange).toHaveBeenCalledWith('teams', 'mail');
      expect(mockPush).toHaveBeenCalledWith('/?lens=teams');

      // Click "Sent" tab
      const sentTab = PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'sent')!;
      executeContextTabClick(sentTab, 'mail', {
        pathname: '/',
        router: { push: mockPush },
        onTabChange,
      });

      expect(onTabChange).toHaveBeenCalledWith('sent', 'mail');
      expect(mockPush).toHaveBeenCalledWith('/sent?tab=sent');

      // Click "Archive" tab
      const archiveTab = PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'archive')!;
      executeContextTabClick(archiveTab, 'mail', {
        pathname: '/',
        router: { push: mockPush },
        onTabChange,
      });

      expect(onTabChange).toHaveBeenCalledWith('archive', 'mail');
      expect(mockPush).toHaveBeenCalledWith('/archive?tab=archive');
    });

    it('clicking Calendar sub-tabs routes to calendar query parameters', () => {
      const onTabChange = vi.fn();

      const monthTab = PILLAR_SUB_CONFIGS.calendar.tabs.find((t) => t.id === 'month')!;
      executeContextTabClick(monthTab, 'calendar', {
        pathname: '/calendar',
        router: { push: mockPush },
        onTabChange,
      });

      expect(onTabChange).toHaveBeenCalledWith('month', 'calendar');
      expect(mockPush).toHaveBeenCalledWith('/calendar?tab=month');

      const bookingTab = PILLAR_SUB_CONFIGS.calendar.tabs.find((t) => t.id === 'booking')!;
      executeContextTabClick(bookingTab, 'calendar', {
        pathname: '/calendar',
        router: { push: mockPush },
        onTabChange,
      });

      expect(onTabChange).toHaveBeenCalledWith('booking', 'calendar');
      expect(mockPush).toHaveBeenCalledWith('/calendar?tab=booking');
    });

    it('clicking QuantGit Copilot tab dispatches quant:copilot:open event', () => {
      const onTabChange = vi.fn();
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      const copilotTab = PILLAR_SUB_CONFIGS.quantgit.tabs.find((t) => t.id === 'copilot')!;
      executeContextTabClick(copilotTab, 'quantgit', {
        pathname: '/quantgit',
        router: { push: mockPush },
        onTabChange,
      });

      expect(onTabChange).toHaveBeenCalledWith('copilot', 'quantgit');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'quant:copilot:open' }),
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quant:subtab-change',
          detail: {
            pillar: 'quantgit',
            tabId: 'copilot',
            queryParam: { key: 'tab', value: 'copilot' },
          },
        }),
      );
    });
  });

  // ==========================================================================
  // 5. Route Visibility Guards
  // ==========================================================================
  describe('Route Visibility Guards', () => {
    it('returns empty markup on deep email thread routes (/thread/*)', () => {
      mockCurrentPathname = '/thread/msg_urgent_alpha_9';
      const html = renderToStaticMarkup(<ContextBottomNavBar />);
      expect(html).toBe('');
    });

    it('returns empty markup on composer routes (/compose)', () => {
      mockCurrentPathname = '/compose';
      const html = renderToStaticMarkup(<ContextBottomNavBar />);
      expect(html).toBe('');
    });

    it('renders navigation bar on standard root and pillar routes', () => {
      mockCurrentPathname = '/';
      expect(renderToStaticMarkup(<ContextBottomNavBar />)).not.toBe('');

      mockCurrentPathname = '/calendar';
      expect(renderToStaticMarkup(<ContextBottomNavBar />)).not.toBe('');

      mockCurrentPathname = '/drive';
      expect(renderToStaticMarkup(<ContextBottomNavBar />)).not.toBe('');

      mockCurrentPathname = '/contacts';
      expect(renderToStaticMarkup(<ContextBottomNavBar />)).not.toBe('');

      mockCurrentPathname = '/quantgit';
      expect(renderToStaticMarkup(<ContextBottomNavBar />)).not.toBe('');
    });
  });

  // ==========================================================================
  // 6. Zero Raw Emojis Invariant
  // ==========================================================================
  describe('Zero Raw Emojis Invariant', () => {
    it('ContextBottomNavBar contains strictly ZERO raw Unicode emojis across all 5 pillars', () => {
      const pillars: ProductivityPillar[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

      pillars.forEach((p) => {
        const html = renderToStaticMarkup(<ContextBottomNavBar activePillarOverride={p} />);
        expect(emojiRegex.test(html)).toBe(false);

        // Explicit check against common raw emojis
        expect(html).not.toContain('📥');
        expect(html).not.toContain('⚡');
        expect(html).not.toContain('👥');
        expect(html).not.toContain('✉️');
        expect(html).not.toContain('📅');
        expect(html).not.toContain('📁');
        expect(html).not.toContain('👑');
        expect(html).not.toContain('🪄');
        expect(html).not.toContain('🔒');
        expect(html).not.toContain('✨');
      });
    });

    it('verifies all icons are rendered using SVG vector elements', () => {
      const html = renderToStaticMarkup(<ContextBottomNavBar activePillarOverride="mail" />);
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('aria-hidden="true"');
    });
  });
});
