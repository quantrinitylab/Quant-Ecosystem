import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ContextBottomNavBar,
  PILLAR_SUB_CONFIGS,
  type ProductivityPillar,
} from '../ContextBottomNavBar';
import {
  QuantPillarTopBar,
  PILLAR_TILES,
  PILLAR_LENSES,
} from '../QuantPillarTopBar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('ContextBottomNavBar & QuantPillarTopBar Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ContextBottomNavBar 5-Pillar Tabs', () => {
    it('defines exactly 5 tabs per pillar', () => {
      const pillars: ProductivityPillar[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];
      pillars.forEach((p) => {
        expect(PILLAR_SUB_CONFIGS[p]).toBeDefined();
        expect(PILLAR_SUB_CONFIGS[p].tabs).toHaveLength(5);
      });
    });

    it('renders Mail contextual tabs with correct badges', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="mail" activeTabOverride="inbox" />
      );

      expect(html).toContain('Mail contextual navigation');
      expect(html).toContain('Inbox');
      expect(html).toContain('Priority');
      expect(html).toContain('Teams');
      expect(html).toContain('Sent');
      expect(html).toContain('Archive');
      expect(html).toContain('12');
      expect(html).toContain('3');
      expect(html).toContain('5');
    });

    it('renders Calendar contextual tabs', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="calendar" activeTabOverride="agenda" />
      );

      expect(html).toContain('Calendar contextual navigation');
      expect(html).toContain('Agenda');
      expect(html).toContain('Month');
      expect(html).toContain('Booking');
      expect(html).toContain('QuantMeet');
      expect(html).toContain('Reminders');
    });

    it('renders Drive contextual tabs with E2EE and CDC badges', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="drive" activeTabOverride="vault" />
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

    it('renders Contacts contextual tabs', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="contacts" activeTabOverride="contacts" />
      );

      expect(html).toContain('Contacts contextual navigation');
      expect(html).toContain('Contacts');
      expect(html).toContain('VIPs');
      expect(html).toContain('Companies');
      expect(html).toContain('AI Dedup');
      expect(html).toContain('Circles');
      expect(html).toContain('8');
    });

    it('renders QuantGit contextual tabs', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="quantgit" activeTabOverride="prs" />
      );

      expect(html).toContain('QuantGit contextual navigation');
      expect(html).toContain('Repos');
      expect(html).toContain('PRs');
      expect(html).toContain('Issues');
      expect(html).toContain('Actions');
      expect(html).toContain('Copilot');
      expect(html).toContain('1');
      expect(html).toContain('CI/CD');
    });

    it('supports badgeOverrides prop for dynamic counts', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar
          activePillarOverride="mail"
          activeTabOverride="inbox"
          badgeOverrides={{ inbox: 42, priority: 9 }}
        />
      );

      expect(html).toContain('42');
      expect(html).toContain('9');
    });

    it('renders aria-label attributes for accessibility', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="drive" activeTabOverride="vault" />
      );

      expect(html).toContain('aria-label="Vault (AES-256 E2EE)"');
      expect(html).toContain('aria-label="Cleaner (FastCDC)"');
    });
  });

  describe('QuantPillarTopBar Tests', () => {
    it('renders 5 squircle mode selector tiles and dynamic island', () => {
      const html = renderToStaticMarkup(
        <QuantPillarTopBar activePillarOverride="mail" />
      );

      PILLAR_TILES.forEach((tile) => {
        expect(html).toContain(tile.label);
      });

      expect(html).toContain('Quant AI:');
      expect(html).toContain('3 urgent items prioritized');
    });

    it('renders sticky search bar with placeholder and mic button', () => {
      const html = renderToStaticMarkup(
        <QuantPillarTopBar activePillarOverride="drive" searchValue="test" />
      );

      expect(html).toContain('Search files, documents, FastCDC tags…');
      expect(html).toContain('Voice Search');
    });
  });
});
