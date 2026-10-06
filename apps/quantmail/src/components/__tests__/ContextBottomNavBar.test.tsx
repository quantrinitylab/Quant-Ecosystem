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
    it('defines contextual tabs per pillar', () => {
      const pillars: ProductivityPillar[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];
      pillars.forEach((p) => {
        expect(PILLAR_SUB_CONFIGS[p]).toBeDefined();
        expect(PILLAR_SUB_CONFIGS[p].tabs.length).toBeGreaterThanOrEqual(4);
      });
    });

    it('renders Mail contextual tabs with correct badges', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="mail" activeTabOverride="inbox" />
      );

      expect(html).toContain('Mail contextual navigation');
      expect(html).toContain('Inbox');
      expect(html).toContain('Teams');
      expect(html).toContain('Agents');
      expect(html).toContain('Archive');
      expect(html).toContain('12');
      expect(html).toContain('3');
    });

    it('renders Calendar contextual tabs', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="calendar" activeTabOverride="feed" />
      );

      expect(html).toContain('Calendar contextual navigation');
      expect(html).toContain('Feed');
      expect(html).toContain('Month');
      expect(html).toContain('Week');
      expect(html).toContain('Trackers');
      expect(html).toContain('Schedule');
    });

    it('renders Drive contextual tabs with Home, Feed, AI Memory, and Vault', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="drive" activeTabOverride="vault" />
      );

      expect(html).toContain('Drive contextual navigation');
      expect(html).toContain('Home');
      expect(html).toContain('Feed');
      expect(html).toContain('AI Memory');
      expect(html).toContain('Vault');
      expect(html).toContain('E2EE');
      expect(html).toContain('AI');
    });

    it('renders Contacts contextual tabs', () => {
      const html = renderToStaticMarkup(
        <ContextBottomNavBar activePillarOverride="contacts" activeTabOverride="home" />
      );

      expect(html).toContain('Contacts contextual navigation');
      expect(html).toContain('Home');
      expect(html).toContain('Favorites');
      expect(html).toContain('Groups');
      expect(html).toContain('Companies');
      expect(html).toContain('AI Dedup');
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
      expect(html).toContain('aria-label="AI Memory (Cross-App Relational Vault)"');
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

      // The live AI capsule pill only renders when a real status string is supplied —
      // never a fabricated "3 urgent items" fallback.
      expect(html).not.toContain('3 urgent items prioritized');
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
