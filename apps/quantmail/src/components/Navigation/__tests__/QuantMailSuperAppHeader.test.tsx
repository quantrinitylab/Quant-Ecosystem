import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantMailSuperAppHeader,
  SUPER_APP_PILLARS,
  QuantMonogramSvg,
} from '../QuantMailSuperAppHeader';

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

describe('QuantMailSuperAppHeader — Amazon/Flipkart-Class Super-App Command Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Brand Identity Tests
  // ==========================================================================
  describe('Brand Identity & Monogram', () => {
    it('renders canonical QuantMail name and Super-App badge', () => {
      const html = renderToStaticMarkup(<QuantMailSuperAppHeader />);
      expect(html).toContain('QuantMail');
      expect(html).toContain('SUPER-APP');
      expect(html).toContain('By Quantrinity Lab');
    });

    it('renders the official SVG Quant Monogram with Q tail geometry', () => {
      const html = renderToStaticMarkup(<QuantMonogramSvg />);
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 32 32"');
      // Circle geometry
      expect(html).toContain('circle cx="16" cy="14" r="10"');
      // Q tail line
      expect(html).toContain('line x1="22" y1="20" x2="28" y2="28"');
    });
  });

  // ==========================================================================
  // Tier 1: Command Header Tests
  // ==========================================================================
  describe('Tier 1: Top Command Header (Workspace Switcher, Search, Utilities)', () => {
    it('renders workspace switcher with default workspace and email', () => {
      const html = renderToStaticMarkup(
        <QuantMailSuperAppHeader
          workspaceName="Quant Trinity Lab"
          userEmail="user@quantmail.in"
        />
      );

      expect(html).toContain('Quant Trinity Lab');
      expect(html).toContain('user@quantmail.in');
      expect(html).toContain('aria-haspopup="listbox"');
    });

    it('renders wide global search bar with Ctrl+K shortcut, voice, and scan lens buttons', () => {
      const html = renderToStaticMarkup(
        <QuantMailSuperAppHeader
          searchPlaceholder="Search across Mail, Calendar, Drive, Contacts, QuantGit… (<5ms FTS5)"
        />
      );

      expect(html).toContain('Search across Mail, Calendar, Drive, Contacts, QuantGit… (&lt;5ms FTS5)');
      expect(html).toContain('Ctrl+K');
      expect(html).toContain('aria-label="Voice Search"');
      expect(html).toContain('aria-label="Scan Document or QR"');
    });

    it('renders utility hub with notification bell, credits chip, and profile avatar', () => {
      const html = renderToStaticMarkup(
        <QuantMailSuperAppHeader
          unreadNotifications={7}
          quantCredits="2,500 QC"
          userInitials="AK"
          userName="Abhishek Kumar"
        />
      );

      // Notification badge
      expect(html).toContain('aria-label="Notifications: 7 unread"');
      expect(html).toContain('7');

      // Quant Credits chip
      expect(html).toContain('2,500 QC');
      expect(html).toContain('title="Quant Credits Balance"');

      // Profile avatar
      expect(html).toContain('AK');
      expect(html).toContain('aria-label="User Profile: Abhishek Kumar"');
    });
  });

  // ==========================================================================
  // Tier 2: 5-Pillar Horizontal Mini-App Rail Tests
  // ==========================================================================
  describe('Tier 2: 5-Pillar Horizontal Mini-App Rail (Flipkart category strip)', () => {
    it('defines exactly 5 canonical pillars in order', () => {
      expect(SUPER_APP_PILLARS).toHaveLength(5);
      expect(SUPER_APP_PILLARS.map((p) => p.id)).toEqual([
        'mail',
        'calendar',
        'drive',
        'contacts',
        'quantgit',
      ]);
    });

    it('renders all 5 pillars with labels and live count badges', () => {
      const html = renderToStaticMarkup(<QuantMailSuperAppHeader activePillar="mail" />);

      // Pillars
      expect(html).toContain('Mail');
      expect(html).toContain('Calendar');
      expect(html).toContain('Drive');
      expect(html).toContain('Contacts');
      expect(html).toContain('QuantGit');

      // Live badges
      expect(html).toContain('12'); // Mail unread
      expect(html).toContain('2'); // Calendar events
      expect(html).toContain('E2EE'); // Drive badge
      expect(html).toContain('8'); // Contacts VIPs
      expect(html).toContain('1'); // QuantGit PRs
    });

    it('marks active pillar with aria-selected and active indicator bar', () => {
      const mailHtml = renderToStaticMarkup(<QuantMailSuperAppHeader activePillar="mail" />);
      expect(mailHtml).toContain('aria-selected="true" aria-label="Mail Pillar (12)"');

      const driveHtml = renderToStaticMarkup(<QuantMailSuperAppHeader activePillar="drive" />);
      expect(driveHtml).toContain('aria-selected="true" aria-label="Drive Pillar (E2EE)"');
      // Underline glow color for Drive (canonical PILLAR_ACCENTS.drive #34A853, QM-UIUX-037)
      expect(driveHtml).toContain('#34A853');
      expect(driveHtml).toContain('rgba(52, 168, 83, 0.25)');
    });
  });

  // ==========================================================================
  // Tier 3: Executive Quick-Glance Widget Tiles Tests
  // ==========================================================================
  describe('Tier 3: Executive Quick-Glance Widget Tiles', () => {
    it('renders Priority Mail tile with unread count and latest subject preview', () => {
      const html = renderToStaticMarkup(
        <QuantMailSuperAppHeader
          priorityMailCount={5}
          priorityMailSubject="Critical: Staging Pods Ready for Deploy"
        />
      );

      expect(html).toContain('Priority Mail');
      expect(html).toContain('5 Unread');
      expect(html).toContain('Critical: Staging Pods Ready for Deploy');
    });

    it('renders Next Meeting tile with 1-tap join button', () => {
      const html = renderToStaticMarkup(
        <QuantMailSuperAppHeader
          nextMeetingTitle="Swarm Tripartite Standup"
          nextMeetingTime="In 5 mins · Google Meet"
        />
      );

      expect(html).toContain('Next Meeting');
      expect(html).toContain('Swarm Tripartite Standup');
      expect(html).toContain('In 5 mins · Google Meet');
      expect(html).toContain('Join Meet');
      expect(html).toContain('aria-label="1-Tap Join Meeting"');
    });

    it('renders QuantDrive Storage Quota tile with capacity bar', () => {
      const html = renderToStaticMarkup(
        <QuantMailSuperAppHeader
          storageUsedGB={25.0}
          storageTotalGB={100.0}
        />
      );

      expect(html).toContain('Drive Quota');
      expect(html).toContain('25 / 100 GB');
      expect(html).toContain('25% capacity used');
      expect(html).toContain('FastCDC E2EE');
    });

    it('renders Executive Quick Actions tile with 4 rapid action buttons', () => {
      const html = renderToStaticMarkup(<QuantMailSuperAppHeader />);

      expect(html).toContain('+ New Email');
      expect(html).toContain('+ New Event');
      expect(html).toContain('+ Upload File');
      expect(html).toContain('+ New Repo');
    });
  });

  // ==========================================================================
  // Strict Invariants: ZERO Raw Unicode Emojis & Obsidian Palette
  // ==========================================================================
  describe('Strict Invariants (Zero Raw Emojis & Palette)', () => {
    it('contains strictly 100% ZERO raw Unicode emojis in rendered output', () => {
      const html = renderToStaticMarkup(<QuantMailSuperAppHeader />);

      // Unicode regex covering standard emoji ranges (Emoticons, Misc Symbols, Dingbats, Transport, Supplemental, etc.)
      const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;

      const hasEmoji = emojiRegex.test(html);
      expect(hasEmoji).toBe(false);
    });

    it('uses the canonical obsidian/slate palette colors (#090A0E, #12151E, #1E222A)', () => {
      const html = renderToStaticMarkup(<QuantMailSuperAppHeader />);

      // Obsidian base
      expect(html).toContain('bg-[#090A0E]');
      // Slate surface
      expect(html).toContain('bg-[#12151E]');
      // Obsidian border
      expect(html).toContain('border-[#1E222A]');
    });

    it('all icons are vector SVGs with aria-hidden="true"', () => {
      const html = renderToStaticMarkup(<QuantMailSuperAppHeader />);

      expect(html).toContain('<svg');
      expect(html).toContain('aria-hidden="true"');
    });
  });
});
