import { describe, expect, it } from 'vitest';
import React from 'react';
import {
  ProfileView,
  formatStatCount,
  renderBioWithLinks,
  type ProfileViewProps,
  type ProfilePostItem,
  type ProfileReelItem,
  type ProfileSavedCollection,
  type ProfileSavedItem,
  type ProfileTaggedItem,
} from '../components/ProfileView';
import {
  PROFILE_TABS,
  selectProfileTab,
  switchAccount,
  getAccountTotalUnreadCount,
  type AccountProfileItem,
} from '../features/profile/profile-matrix';

describe('QuantGram ProfileView & 4-Tab Matrix (Task W39-G04)', () => {
  it('exports ProfileView component function', () => {
    expect(ProfileView).toBeDefined();
    expect(typeof ProfileView).toBe('function');
  });

  describe('Stat Counter Formatter', () => {
    it('formats small counts with locale formatting', () => {
      expect(formatStatCount(0)).toBe('0');
      expect(formatStatCount(42)).toBe('42');
      expect(formatStatCount(999)).toBe('999');
    });

    it('formats thousands into K abbreviation', () => {
      expect(formatStatCount(10000)).toBe('10K');
      expect(formatStatCount(14500)).toBe('14.5K');
      expect(formatStatCount(999000)).toBe('999K');
    });

    it('formats millions into M abbreviation', () => {
      expect(formatStatCount(1000000)).toBe('1M');
      expect(formatStatCount(1200000)).toBe('1.2M');
      expect(formatStatCount(1250000)).toBe('1.3M');
      expect(formatStatCount(3800000)).toBe('3.8M');
    });
  });

  describe('Bio Parser (Clickable Mentions, Hashtags, URLs)', () => {
    it('parses @mentions into profile links', () => {
      const bio = 'Founder @quantrinity and architect @astra_ceo';
      const nodes = renderBioWithLinks(bio);
      expect(nodes.length).toBeGreaterThan(1);

      // Check mention nodes
      const mentionNodes = nodes.filter(
        (n) => React.isValidElement(n) && (n.props as any).href?.startsWith('/profile/'),
      );
      expect(mentionNodes.length).toBe(2);
      expect((mentionNodes[0] as any).props.href).toBe('/profile/quantrinity');
      expect((mentionNodes[1] as any).props.href).toBe('/profile/astra_ceo');
    });

    it('parses #hashtags into interactive styled tokens', () => {
      const bio = 'Building the #quantgram future #sovereign';
      const nodes = renderBioWithLinks(bio);

      const hashtagNodes = nodes.filter(
        (n) => React.isValidElement(n) && String((n.props as any).children).startsWith('#'),
      );
      expect(hashtagNodes.length).toBe(2);
      expect((hashtagNodes[0] as any).props.children).toBe('#quantgram');
      expect((hashtagNodes[1] as any).props.children).toBe('#sovereign');
    });

    it('parses external URLs into clickable links with target="_blank"', () => {
      const bio = 'Check our live ecosystem at https://quantmail.in and build';
      const nodes = renderBioWithLinks(bio);

      const linkNodes = nodes.filter(
        (n) => React.isValidElement(n) && (n.props as any).href === 'https://quantmail.in',
      );
      expect(linkNodes.length).toBe(1);
      expect((linkNodes[0] as any).props.target).toBe('_blank');
      expect((linkNodes[0] as any).props.rel).toBe('noopener noreferrer');
    });

    it('handles mixed bio with plain text, pronouns, mentions, and hashtags', () => {
      const bio = 'Hi! Building @quantrinity with #ai. Visit https://quantube.in for demos.';
      const nodes = renderBioWithLinks(bio);
      expect(nodes.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('4-Tab Matrix Configuration & Navigation', () => {
    it('contains the forensic Instagram 4-tab suite: Posts, Reels, Saved, Tagged', () => {
      const tabIds = PROFILE_TABS.map((t) => t.id);
      expect(tabIds).toEqual(['posts', 'reels', 'saved', 'tagged']);
      expect(PROFILE_TABS.find((t) => t.id === 'posts')?.label).toBe('Posts');
      expect(PROFILE_TABS.find((t) => t.id === 'reels')?.label).toBe('Reels');
      expect(PROFILE_TABS.find((t) => t.id === 'saved')?.label).toBe('Saved');
      expect(PROFILE_TABS.find((t) => t.id === 'tagged')?.label).toBe('Tagged');
    });

    it('supports tab navigation state engine', () => {
      let currentTab = selectProfileTab('posts', 'reels');
      expect(currentTab.activeTab).toBe('reels');
      expect(currentTab.isChanged).toBe(true);

      currentTab = selectProfileTab('reels', 'saved');
      expect(currentTab.activeTab).toBe('saved');
      expect(currentTab.isChanged).toBe(true);

      currentTab = selectProfileTab('saved', 'tagged');
      expect(currentTab.activeTab).toBe('tagged');
      expect(currentTab.isChanged).toBe(true);

      currentTab = selectProfileTab('tagged', 'tagged');
      expect(currentTab.activeTab).toBe('tagged');
      expect(currentTab.isChanged).toBe(false);
    });
  });

  describe('Multi-Account Switcher & Unread Count State Engine', () => {
    const testAccounts: AccountProfileItem[] = [
      {
        id: 'acc-1',
        username: 'quant_creator',
        displayName: 'Quant Creator',
        avatar: '/creator.png',
        isVerified: true,
        isCurrent: true,
        unreadCount: 0,
      },
      {
        id: 'acc-2',
        username: 'alex_personal',
        displayName: 'Alex Personal',
        avatar: '/personal.png',
        isCurrent: false,
        unreadCount: 5,
      },
      {
        id: 'acc-3',
        username: 'quant_studio_official',
        displayName: 'Quant Studio',
        avatar: '/studio.png',
        isVerified: true,
        isCurrent: false,
        unreadCount: 8,
      },
    ];

    it('calculates total unread notifications for inactive accounts correctly', () => {
      const totalUnread = getAccountTotalUnreadCount(testAccounts);
      // acc-2 (5) + acc-3 (8) = 13 (current acc-1 ignored)
      expect(totalUnread).toBe(13);
    });

    it('switches current account atomically without losing account list', () => {
      const result = switchAccount(testAccounts, 'acc-2');
      expect(result.currentAccount?.id).toBe('acc-2');
      expect(result.currentAccount?.isCurrent).toBe(true);

      const acc1 = result.accounts.find((a) => a.id === 'acc-1');
      const acc2 = result.accounts.find((a) => a.id === 'acc-2');
      const acc3 = result.accounts.find((a) => a.id === 'acc-3');

      expect(acc1?.isCurrent).toBe(false);
      expect(acc2?.isCurrent).toBe(true);
      expect(acc3?.isCurrent).toBe(false);

      // New total unread count: acc-1 (0) + acc-3 (8) = 8 (acc-2 is now current)
      expect(getAccountTotalUnreadCount(result.accounts)).toBe(8);
    });
  });
});
